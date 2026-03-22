# AI Agent 上下文管理优化方案

> 基于对 `termcat_client/src/modules/ai-agent` 和 `termcat_agent_server/app/services/advanced_agent*.py` 的完整代码审计。

---

## 一、现状分析

### 1.1 当前架构概览

```
用户提问
  ↓
Phase 1: analyze_requirement     ← 独立 AI 调用，输入：prompt + context
  ↓ 输出 analysis_result
Phase 2: create_execution_plan   ← 独立 AI 调用，输入：prompt + analysis + context
  ↓ 输出 plan (静态步骤列表)
Phase 3: 逐步执行                ← 按预定计划发送命令，等待执行结果
  ├─ 成功 → 直接发下一步的预定命令
  └─ 失败 → Phase 3a: error_analysis (独立 AI 调用)
       ├─ auto_fix → 重试
       └─ need_user_choice → 等待用户选择 → Phase 3b: command_regeneration
  ↓
Phase 4: final_summary           ← 独立 AI 调用，输入：prompt + plan + results
```

### 1.2 上下文在各阶段的传递情况

| 阶段 | 接收的上下文 | 系统信息(OS/Shell) | 缺失的关键上下文 |
|------|-------------|-------------------|-----------------|
| Phase 1 (分析) | prompt, context(os/shell) | ✅ context 中携带 | - |
| Phase 2 (计划) | prompt, analysis, context, skills | ✅ 系统提示词中注入 | - |
| Phase 3 (执行) | 预定的 command（静态） | ❌ **丢失** | **前序步骤的执行输出** |
| Phase 3a (错误分析) | original_request, failed_cmd, error, execution_history(截断200字), retry_history | ❌ **丢失** | **完整计划、系统信息、步骤预期结果、前序输出完整内容** |
| Phase 3a (详细错误分析) | command, error, step_description, retry_history | ❌ **丢失** | **原始需求、系统信息、完整计划** |
| Phase 3b (命令重生成) | original_cmd, error, user_choice, original_prompt, step_description | ❌ **丢失** | **execution_history、完整计划、系统信息** |
| Phase 4 (总结) | prompt, plan_steps, results(截断800字) | ❌ **丢失** | 完整执行输出可能被截断 |

> **核心问题**：系统信息（OS 类型、版本、Shell）仅在 Phase 1 和 Phase 2 中使用，Phase 3（错误分析、命令重生成）和 Phase 4（最终总结）中完全丢失。这会导致 AI 在后续阶段生成不兼容目标系统的命令（例如在 Ubuntu 上建议 `yum` 命令，在 macOS 上建议 `systemctl`）。

### 1.3 Session 数据结构（服务端）

```python
session = {
    "task_id": str,
    "original_prompt": str,          # 原始需求（全程保持不变）
    "history": [],                   # 消息历史（仅 append，从未被任何 AI 调用使用）
    "files": {},                     # 附件文件
    "context": {},                   # os_type, shell 等
    "model": str,
    "analysis": {},                  # Phase 1 结果（仅被 Phase 2 使用）
    "plan": {},                      # Phase 2 结果（静态，执行过程中不更新）
    "results": [],                   # 执行结果列表（累积）
    "current_commands": {},          # 当前命令（含重试后的修改版本）
    "retry_counts": {},              # 重试计数
    "retry_history": {},             # 重试历史（按 step_key 索引）
    "pending_choice_context": {},    # 用户选择上下文
    "total_input_tokens": int,
    "total_output_tokens": int,
}
```

---

## 二、问题诊断

### 问题 1：静态计划，不随执行结果调整（核心问题）

**现象**：计划一次性生成后固化不变，后续步骤的命令在执行前不会根据前序步骤的输出进行调整。

**实际案例**（用户提供的对话日志）：

```
用户需求：查看服务器最近的重启记录

计划生成：
  Step 0: last reboot && who -b       ← 查看重启记录
  Step 1: last reboot | grep -c '^reboot'  ← 统计重启次数

Step 0 执行结果：
  wtmp begins Sun Feb  1 00:18:06 2026   ← 关键信息：wtmp 被轮转过
  system boot  2026-01-15 18:14          ← 没有 reboot 记录行

Step 1 执行：
  仍然执行预定的 grep -c '^reboot' ← 必然失败，因为没有 reboot 行
  返回 exit code 1
```

**根本原因**：Step 0 的输出清楚显示 `last reboot` 没有返回任何 reboot 记录行（wtmp 已被轮转），Step 1 的命令理应被调整（例如改用 `journalctl` 或直接基于 Step 0 的结果回答），但系统原封不动地执行了预定命令。

**代码定位**：
- `advanced_agent.py:612-645` — 计划生成后，直接按 `plan["steps"]` 逐步发送命令
- `advanced_agent_execution_handler.py:727-751` — `_proceed_to_next_step` 直接取 `steps[next_step_index]` 的预定命令

### 问题 2：错误分析上下文严重截断

**现象**：错误分析时，前序步骤的执行输出被截断到 200 字符，关键操作信息丢失。

**代码定位**：`advanced_agent_prompts.py:472-479`

```python
# 成功步骤的输出仅保留 200 字符
if success:
    output = result.get('output', '')[:200]
    if output:
        history_text += f"    输出: {output}\n"
else:
    error = result.get('error', '')[:200]
```

**影响**：当前步骤失败时，AI 在分析错误时无法看到前序步骤的完整输出。例如：
- 前序步骤查询了配置文件内容（通常几百到上千字符），后续步骤需要基于该内容修改配置
- 200 字符截断导致 AI 无法获取完整的配置内容，进而无法生成正确的修复命令

### 问题 3：retry_history 的 key 不一致 BUG

**现象**：错误分析传入的 `retry_history` 始终为空数组，AI 不知道哪些命令已尝试过（可能导致重复尝试已失败的命令）。

**代码定位**：

存储时使用 `{task_id}_{step_index}`：
```python
# advanced_agent_execution_handler.py:146
step_key = f"{task_id}_{step_index}"
session["retry_history"][step_key] = []
```

读取时使用 `step_{step_index}`：
```python
# advanced_agent_execution_handler.py:347
step_key = f"step_{step_index}"
retry_history = retry_history_dict.get(step_key, [])  # ← 永远返回空列表
```

**影响**：传给 `error_analysis_service.analyze_error_and_generate_options()` 的 `retry_history` 总是 `[]`，AI 无法避免重复推荐已失败的命令。虽然 `_handle_auto_fix_flow` 和 `_handle_detailed_analysis_flow` 中有本地的重复检测（用正确的 key），但 AI 提示词中缺少重试历史信息会影响 AI 的决策质量。

### 问题 4：系统信息在 Phase 3/4 完全丢失（关键问题）

**现象**：用户连接时携带的系统信息（`os_type`、`os_version`、`shell`）存储在 `session["context"]` 中，但只在 Phase 1 和 Phase 2 的提示词中使用。从 Phase 3 开始的所有 AI 调用都不包含系统信息。

**代码验证**：

```python
# Phase 2 — 有系统信息 ✅
# advanced_agent_prompts.py:130-135
def build_execution_plan_system_prompt(analysis, context=None):
    os_type = context.get('os_type', 'linux') if context else 'linux'
    os_version = context.get('os_version', '') if context else ''
    shell = context.get('shell', 'bash') if context else 'bash'

# Phase 3a — 无系统信息 ❌
# advanced_agent_execution_handler.py:370-382
context={
    "original_request": session.get("original_prompt"),
    "model": session.get("model"),
    "retry_count": retry_count,
    "execution_history": execution_history,
    "retry_history": retry_history,
    # os_type, os_version, shell 均未传入
}

# Phase 3a 详细分析 — 无系统信息 ❌
# advanced_agent_prompts.py:557-635
# build_command_failure_analysis_prompt 无系统信息参数

# Phase 3b — 无系统信息 ❌
# advanced_agent_prompts.py:500-550
# build_command_regeneration_user_prompt 无系统信息参数

# Phase 4 — 无系统信息 ❌
# advanced_agent_prompts.py:32-72
# build_final_summary_user_prompt 无系统信息参数
```

**实际影响**：
- 错误分析阶段 AI 可能建议 `yum install` 但目标系统是 Ubuntu（应用 `apt`）
- 命令重生成阶段 AI 可能建议 `brew install` 但目标系统是 Linux
- AI 不知道目标 Shell 是 bash/zsh/sh，可能生成不兼容的语法
- 最终总结中无法准确描述目标环境

### 问题 5：各阶段 AI 调用完全独立，无对话记忆

**现象**：每个 Phase 都是独立的 AI API 调用，没有 conversation history。`session["history"]` 虽然被维护，但从未被任何 AI 调用消费。

**影响**：
- Phase 3a（错误分析）不知道 Phase 1 的分析结论和 Phase 2 的计划全貌
- Phase 3b（命令重生成）不知道前序步骤的执行历史
- 多轮重试时，AI 没有之前分析轮次的推理记录

### 问题 6：错误分析缺少关键上下文

**现象**：错误分析 AI 调用缺少以下关键信息：

| 缺失信息 | 影响 |
|---------|------|
| **系统信息（OS/Shell）** | **无法生成适配目标系统的修复命令** |
| 完整执行计划（所有步骤） | 无法理解当前步骤在整体目标中的位置和作用 |
| 当前步骤的 expected_result | 无法判断"成功但结果不符合预期"的情况 |
| 前序步骤的完整输出 | 无法利用前序结果来修正当前步骤 |

**代码定位**：`advanced_agent_execution_handler.py:370-382`

```python
context={
    "original_request": session.get("original_prompt"),
    "model": session.get("model"),
    "retry_count": retry_count,
    "execution_history": execution_history,  # 只有 results 列表
    "retry_history": retry_history,          # 且 key 不匹配（见问题3）
}
# 缺少：plan, context(os/shell), step expected_result
```

### 问题 7：命令重生成上下文不足

**现象**：用户选择后重新生成命令时（`handle_user_choice_response`），传入的上下文只有当前步骤的信息，缺少前序步骤的执行结果。

**代码定位**：`advanced_agent.py:329-338` — `build_command_regeneration_user_prompt` 未传入 `execution_history`。

**影响**：如果命令需要基于前序步骤的输出（比如读取到的配置文件内容），重生成的命令也无法获取这些信息。

### 问题 8：成功步骤不触发输出评估

**现象**：步骤执行成功后，系统不评估输出内容是否符合预期，直接进入下一步。

**案例**：
- 步骤 "检查磁盘空间" 执行 `df -h` 成功，但返回了异常结果（磁盘满）
- 系统不做任何评估，直接执行下一步 "部署应用"
- 合理行为应该是：检测到磁盘满后，暂停并提示用户

---

## 三、优化方案

### 方案概述

```
优化目标：让 AI 在执行过程中保持对完整任务上下文的感知，
         每一步都能基于前序步骤的实际执行结果做出智能决策。

核心原则：
  1. 累积上下文，逐步丰富  — 每步执行结果都成为后续步骤的输入
  2. 关键信息不截断       — 操作输出作为核心上下文完整保留
  3. 动态调整计划         — 基于实际执行结果动态修正后续步骤
  4. 统一上下文传递       — 所有 AI 调用共享结构化的完整上下文
```

### 3.1 引入 TaskContext 结构化上下文对象

**目标**：建立统一的上下文容器，所有 AI 调用共享。

**服务端改动**：在 `advanced_agent_prompts.py` 中新增：

```python
class TaskContext:
    """任务执行上下文 — 贯穿整个任务生命周期"""

    def __init__(self, session: Dict[str, Any]):
        self.original_prompt: str = session.get("original_prompt", "")
        self.os_type: str = session.get("context", {}).get("os_type", "linux")
        self.os_version: str = session.get("context", {}).get("os_version", "")
        self.shell: str = session.get("context", {}).get("shell", "bash")
        self.plan_steps: List[Dict] = session.get("plan", {}).get("steps", [])
        self.plan_description: str = session.get("plan", {}).get("description", "")
        self.results: List[Dict] = session.get("results", [])
        self.analysis: Dict = session.get("analysis", {})

    def get_execution_summary(self, max_output_chars: int = 1000) -> str:
        """生成执行历史摘要（用于注入 AI 提示词）"""
        if not self.results:
            return "(尚未执行任何步骤)"

        lines = []
        for r in self.results:
            idx = r.get("step_index", "?")
            success = r.get("success", False)
            cmd = r.get("command", "")
            output = (r.get("output") or "")[:max_output_chars]
            error = (r.get("error") or "")[:max_output_chars]

            status = "SUCCESS" if success else "FAILED"
            lines.append(f"[Step {idx}] {status}")
            lines.append(f"  Command: {cmd}")
            if success and output:
                lines.append(f"  Output:\n    {output}")
            elif not success and error:
                lines.append(f"  Error:\n    {error}")
        return "\n".join(lines)

    def get_plan_overview(self) -> str:
        """生成计划概览"""
        if not self.plan_steps:
            return "(无执行计划)"

        lines = [f"目标: {self.plan_description}"]
        for i, step in enumerate(self.plan_steps):
            desc = step.get("description", "")
            cmd = step.get("command", "")
            risk = step.get("risk", "low")
            expected = step.get("expected_result", "")
            status = self._get_step_status(i)

            line = f"  Step {i}: [{status}] {desc} (risk={risk})"
            if cmd:
                line += f"\n    Command: {cmd}"
            if expected:
                line += f"\n    Expected: {expected}"
            lines.append(line)
        return "\n".join(lines)

    def _get_step_status(self, step_index: int) -> str:
        """获取步骤状态"""
        for r in reversed(self.results):
            if r.get("step_index") == step_index:
                return "DONE" if r.get("success") else "FAILED"
        return "PENDING"

    def get_system_info(self) -> str:
        """生成系统信息"""
        os_desc = self.os_type
        if self.os_version:
            os_desc += f" {self.os_version}"
        return f"OS: {os_desc}, Shell: {self.shell}"
```

### 3.2 步骤间输出传递与动态计划调整

**目标**：每个步骤执行成功后，AI 评估输出并决定是否需要调整后续步骤的命令。

**核心改动**：在 `_handle_execution_success` 和 `_proceed_to_next_step` 之间，新增"步骤衔接评估"。

**新增 Phase 3.5: step_transition_evaluation**

```python
# 新增提示词
STEP_TRANSITION_PROMPT = """你是系统运维专家。上一个步骤刚执行完成，请根据执行结果评估下一步骤的命令是否需要调整。

**当前任务上下文**：
{task_context}

**上一步执行结果**：
- 步骤 {prev_step_index}: {prev_step_description}
- 命令: {prev_command}
- 输出:
{prev_output}

**下一步骤（待执行）**：
- 步骤 {next_step_index}: {next_step_description}
- 预定命令: {next_command}
- 预期结果: {expected_result}

请判断：
1. 上一步的输出是否揭示了与预期不同的情况？
2. 下一步的预定命令是否仍然适用？
3. 如果需要调整，提供修正后的命令。

以 JSON 格式回复：
```json
{
    "needs_adjustment": true/false,
    "reasoning": "判断理由（1句话）",
    "adjusted_command": "调整后的命令（仅当 needs_adjustment=true 时需要）",
    "skip_step": false,
    "skip_reason": "跳过原因（仅当 skip_step=true 时需要）"
}
```
"""
```

**流程变化**：

```
步骤 N 执行成功
  ↓
Step Transition Evaluation（新增）
  ├─ needs_adjustment=false → 直接发送步骤 N+1 的预定命令
  ├─ needs_adjustment=true  → 发送调整后的命令
  └─ skip_step=true         → 跳过步骤 N+1，继续步骤 N+2
  ↓
步骤 N+1 执行...
```

**代码改动位置**：`advanced_agent_execution_handler.py` 的 `_handle_execution_success` 方法。

```python
async def _handle_execution_success(self, task_id, session_id, step_index, steps):
    session = self.active_sessions[session_id]
    next_step_index = step_index + 1
    session["steps_completed"] += 1

    if next_step_index < len(steps):
        next_step = steps[next_step_index]

        # 只有当下一步有命令时才做衔接评估
        if next_step.get("command"):
            # 获取上一步的执行结果
            prev_result = self._get_latest_result(session, step_index)

            # 评估是否需要调整
            if prev_result and prev_result.get("output"):
                adjustment = await self._evaluate_step_transition(
                    task_id, session, step_index, next_step_index, steps
                )
                if adjustment:
                    if adjustment.get("skip_step"):
                        # 跳过此步骤，继续下一步
                        yield build_answer_message(...)
                        async for msg in self._handle_execution_success(
                            task_id, session_id, next_step_index, steps
                        ):
                            yield msg
                        return

                    if adjustment.get("needs_adjustment"):
                        # 使用调整后的命令
                        adjusted_cmd = adjustment["adjusted_command"]
                        next_step["command"] = adjusted_cmd  # 更新计划中的命令
                        # 记录到 current_commands
                        step_key = f"{task_id}_{next_step_index}"
                        session.setdefault("current_commands", {})[step_key] = adjusted_cmd

        async for msg in self._proceed_to_next_step(task_id, next_step_index, steps):
            yield msg
    else:
        async for msg in self._complete_all_steps(task_id, session_id, steps):
            yield msg
```

### 3.3 增强错误分析上下文

**目标**：错误分析时提供完整的上下文，而非截断版本。

**改动 1：修复 retry_history key 不一致 BUG**

```python
# advanced_agent_execution_handler.py:347
# 修改前:
step_key = f"step_{step_index}"

# 修改后:
step_key = f"{task_id}_{step_index}"
```

**改动 2：在 `_analyze_and_handle_error` 中传递完整上下文**

```python
# advanced_agent_execution_handler.py:370-382
choice_analysis = await error_analysis_service.analyze_error_and_generate_options(
    task_id=task_id,
    step_index=step_index,
    original_command=steps[step_index].get("command", ""),
    error_message=error or output,
    context={
        "original_request": session.get("original_prompt"),
        "model": session.get("model"),
        "retry_count": retry_count,
        "execution_history": execution_history,
        "retry_history": retry_history,
        # ===== 新增 =====
        "plan_steps": steps,                              # 完整计划
        "current_step_index": step_index,                 # 当前步骤位置
        "expected_result": steps[step_index].get("expected_result", ""),  # 预期结果
        "os_type": session.get("context", {}).get("os_type", ""),
        "shell": session.get("context", {}).get("shell", ""),
        "plan_description": session.get("plan", {}).get("description", ""),
    },
)
```

**改动 3：增加错误分析提示词的上下文**

在 `build_error_analysis_user_prompt` 中新增计划上下文和系统信息：

```python
def build_error_analysis_user_prompt(
    original_request: str,
    original_command: str,
    error_message: str,
    execution_history: Optional[List[Dict[str, Any]]] = None,
    retry_history: Optional[List[str]] = None,
    # ===== 新增参数 =====
    plan_steps: Optional[List[Dict[str, Any]]] = None,
    current_step_index: Optional[int] = None,
    expected_result: Optional[str] = None,
    system_info: Optional[str] = None,
) -> str:
    prompt = f"""**原始需求**：{original_request}
**执行的命令**：{original_command}
**错误信息**：{error_message}
"""

    # 新增：系统信息
    if system_info:
        prompt += f"\n**目标系统**：{system_info}\n"

    # 新增：当前步骤在计划中的位置
    if plan_steps and current_step_index is not None:
        prompt += f"\n**执行计划概览**（当前在步骤 {current_step_index}）：\n"
        for i, step in enumerate(plan_steps):
            marker = "→ " if i == current_step_index else "  "
            desc = step.get("description", "")
            prompt += f"  {marker}[{i}] {desc}\n"

    # 新增：预期结果
    if expected_result:
        prompt += f"\n**当前步骤的预期结果**：{expected_result}\n"

    # 执行历史（增大截断阈值）
    if execution_history:
        history_text = "\n**之前的执行历史**：\n"
        for i, result in enumerate(execution_history):
            step_idx = result.get('step_index', i)
            cmd = result.get('command', '')
            success = result.get('success', False)
            status = 'SUCCESS' if success else 'FAILED'
            history_text += f"  步骤 {step_idx}: {status}\n"
            history_text += f"    命令: {cmd}\n"
            if success:
                output = result.get('output', '')[:800]  # 从200提升到800
                if output:
                    history_text += f"    输出: {output}\n"
            else:
                error = result.get('error', '')[:800]    # 从200提升到800
                if error:
                    history_text += f"    错误: {error}\n"
        prompt += history_text

    # 重试历史（保持不变）
    if retry_history:
        retry_text = "\n**当前步骤的重试历史**（这些命令都失败了，请不要再尝试）：\n"
        for i, cmd in enumerate(retry_history, 1):
            retry_text += f"  尝试 {i}: {cmd}\n"
        prompt += retry_text

    return prompt
```

### 3.4 增强命令重生成上下文

**目标**：用户选择后重新生成命令时，AI 能看到前序步骤的执行结果。

**改动**：`advanced_agent.py:329-338` 的 `handle_user_choice_response` 中：

```python
# 新增：将前序步骤执行结果注入 prompt
execution_history = session.get("results", [])
execution_context = ""
if execution_history:
    execution_context = "\n\n**前序步骤执行结果**：\n"
    for r in execution_history:
        idx = r.get("step_index", "?")
        success = "SUCCESS" if r.get("success") else "FAILED"
        cmd = r.get("command", "")
        output = (r.get("output") or "")[:600]
        execution_context += f"  Step {idx} [{success}]: {cmd}\n"
        if output:
            execution_context += f"    Output: {output}\n"

regenerate_prompt = build_command_regeneration_user_prompt(
    original_command=original_command,
    original_error=original_error,
    issue=issue,
    question=question,
    options_text=options_text,
    selected_value=selected_value,
    original_prompt=session.get('original_prompt', ''),
    step_description=original_step.get('description', ''),
    execution_context=execution_context,  # 新增参数
)
```

### 3.5 成功执行后的输出质量评估（可选增强）

**目标**：检测"命令成功但结果异常"的情况（如磁盘满、服务异常等）。

**策略**：仅在高风险步骤或复杂任务中启用，避免每步都调用 AI 增加延迟和成本。

**实现方式**：合并到 3.2 的 Step Transition Evaluation 中。在评估下一步是否需要调整时，同时评估上一步的输出是否存在异常。无需单独的 AI 调用。

---

## 四、改动清单与影响评估

### 4.1 改动清单

| 优先级 | 改动项 | 涉及文件 | 改动量 | 影响范围 |
|-------|--------|---------|-------|---------|
| **P0** | 修复 retry_history key 不一致 BUG | `advanced_agent_execution_handler.py:347` | 1 行 | 错误重试准确性 |
| **P1** | 系统信息全链路传递（OS/Shell 注入 Phase 3/3a/3b/4 所有 AI 调用） | `advanced_agent_execution_handler.py`, `advanced_agent_prompts.py`, `advanced_agent_error_analysis.py`, `advanced_agent.py` | ~40 行 | 命令系统兼容性 |
| **P1** | 增强错误分析上下文（传入计划、增大截断阈值） | `advanced_agent_execution_handler.py`, `advanced_agent_prompts.py` | ~50 行 | 错误修复质量 |
| **P1** | 增强命令重生成上下文（注入执行历史） | `advanced_agent.py`, `advanced_agent_prompts.py` | ~30 行 | 用户选择后命令质量 |
| **P2** | 新增 TaskContext 结构化上下文 | `advanced_agent_prompts.py` 新增类 | ~80 行 | 统一上下文管理 |
| **P2** | 新增 Step Transition Evaluation | `advanced_agent_execution_handler.py`, `advanced_agent_prompts.py` | ~100 行 | 后续步骤准确性 |
| **P3** | 成功输出质量评估 | 合并到 P2 | 0 额外行 | 异常检测能力 |

### 4.2 客户端影响

**客户端无需改动**。所有优化都在服务端完成，客户端的 `AIAgent` 模块保持现有协议不变：
- WebSocket 消息类型不变
- 执行流程不变（仍是 EXECUTE_REQUEST → 执行 → CONFIRM_EXECUTE）
- Step Transition Evaluation 在服务端透明完成，对客户端表现为"下一步的命令可能与计划中的不同"，但客户端本来就是按 STEP_DETAIL 中的 `command` 字段执行，不依赖计划中的预定命令

### 4.3 Token 消耗影响

| 改动项 | 额外 Token 消耗 | 说明 |
|-------|----------------|------|
| 增强错误分析上下文 | ~200-500 tokens/次 | 仅在命令失败时触发 |
| 增强命令重生成上下文 | ~200-400 tokens/次 | 仅在用户选择后触发 |
| Step Transition Evaluation | ~500-1000 tokens/步 | 每步成功后触发 |

**P2 的 Step Transition 是主要的额外开销**。可通过以下策略控制：
- 仅在 `complexity=moderate/complex` 的任务中启用
- 仅在前序步骤有实际输出时启用（纯写入操作不触发）
- 设置输出长度阈值，输出过短（<50字符）时跳过评估

---

## 五、实施计划

### Phase A：紧急修复（P0，预计 0.5h）

1. 修复 `retry_history` key 不一致 BUG
   - `advanced_agent_execution_handler.py:347`
   - 将 `f"step_{step_index}"` 改为 `f"{task_id}_{step_index}"`

### Phase B：上下文增强（P1，预计 2-3h）

**B1. 系统信息全链路传递**（确保 OS/Shell 信息在所有 AI 调用中可用）

1. 错误分析入口 `_analyze_and_handle_error` 向 context 注入 `os_type`、`os_version`、`shell`（从 `session["context"]` 读取）
2. `build_error_analysis_user_prompt` 新增 `system_info` 参数，在提示词中渲染
3. `build_command_failure_analysis_prompt` 新增系统信息参数
4. `build_command_regeneration_user_prompt` 新增系统信息参数
5. `build_final_summary_user_prompt` 新增系统信息参数
6. `error_analysis_service.analyze_error_and_generate_options` 的系统提示词中追加目标系统描述

**涉及文件**：
- `advanced_agent_execution_handler.py` — 传递 session context
- `advanced_agent_error_analysis.py` — 注入系统提示词
- `advanced_agent_prompts.py` — 所有 `build_*_prompt` 函数增加系统信息
- `advanced_agent.py` — `handle_user_choice_response` 和 `_stream_final_summary` 传入系统信息

**B2. 增强错误分析上下文**

1. 增大错误分析中执行历史的截断阈值（200 → 800）
2. 错误分析 context 中增加 plan_steps、expected_result
3. 修改 `build_error_analysis_user_prompt` 渲染计划概览和预期结果

**B3. 增强命令重生成上下文**

1. 命令重生成 prompt 中注入前序执行结果
2. 修改 `build_command_regeneration_user_prompt` 增加 `execution_context` 参数

### Phase C：动态计划调整（P2，预计 4h）

1. 实现 `TaskContext` 类
2. 新增 `STEP_TRANSITION_PROMPT` 提示词
3. 在 `_handle_execution_success` 中增加步骤衔接评估逻辑
4. 实现 `_evaluate_step_transition` 方法
5. 添加评估结果处理（命令调整/步骤跳过）
6. 添加控制开关（按任务复杂度启用/禁用）

### Phase D：验证与测试（预计 2h）

1. 使用现有 finetuning 测试用例验证
2. 重点测试场景：
   - 前步输出影响后步命令的案例（配置文件编辑）
   - 命令失败后的重试（验证 retry_history 修复）
   - 多步骤任务中上下文传递的完整性
3. 对比优化前后的 AI 对话日志

---

## 六、优化前后对比

### 案例：查看服务器重启记录

**优化前**：
```
Step 0: last reboot → 输出：wtmp begins Feb 1 (无 reboot 记录)
Step 1: grep -c '^reboot' → 必然失败 (exit code 1)
→ 触发错误分析（200字截断上下文）
→ AI 盲目修改 grep 参数
→ 仍然失败或返回无意义结果
```

**优化后（Phase C 启用后）**：
```
Step 0: last reboot → 输出：wtmp begins Feb 1 (无 reboot 记录)
  ↓ Step Transition Evaluation
  AI 判断：wtmp 已被轮转，没有 reboot 记录行
  → needs_adjustment=true
  → adjusted_command: "journalctl --list-boots 2>/dev/null | wc -l || echo 0"
  或 skip_step=true（直接基于 Step 0 的结果得出结论）
Step 1: 执行调整后的命令 → 成功获取启动记录
→ 任务顺利完成
```

### 案例：修改 Nginx 配置文件

**优化前**：
```
Step 0: cat /etc/nginx/nginx.conf → 输出完整配置（假设 2000 字符）
Step 1: heredoc 写入新配置 → AI 用占位符（因为计划阶段还没看到实际配置）
→ 配置错误，Nginx 无法启动
```

**优化后**：
```
Step 0: cat /etc/nginx/nginx.conf → 输出完整配置
  ↓ Step Transition Evaluation
  AI 看到完整配置内容 → 在 adjusted_command 中生成包含实际配置的 heredoc
Step 1: 执行包含真实配置内容的 heredoc → 配置正确
→ Nginx 正常重启
```

---

## 七、会话上下文生命周期分析与跨任务上下文方案

### 7.1 问题定义

上下文管理分为两个层级：

| 层级 | 含义 | 例子 |
|------|------|------|
| **Level 1：单次任务内上下文** | 一次提问从分析→计划→执行→总结的全过程 | "查看磁盘使用情况" 的 4 个 Phase 之间 |
| **Level 2：跨任务上下文** | 同一个终端会话中，多次提问之间的上下文关联 | 第一次"查看 Nginx 配置"→ 第二次"修改刚才看到的 server_name" |

### 7.2 Level 1：单次任务内上下文（现状分析）

#### 7.2.1 上下文存储位置

单次任务的上下文存储在服务端 `active_sessions[session_id]` 字典中：

```python
# advanced_agent.py:513-525
if session_id not in self.active_sessions:
    self.active_sessions[session_id] = {
        "task_id": task_id,
        "history": [],              # 用户消息历史
        "files": {},                # 附件文件
        "context": context or {},   # os_type, shell 等
        "model": model,
        "ui_language": ui_language,
        "original_prompt": prompt,
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "steps_completed": 0,
    }
```

执行过程中动态增加的字段：
```python
session["analysis"] = {...}           # Phase 1 分析结果
session["plan"] = {...}               # Phase 2 执行计划
session["results"] = [...]            # Phase 3 各步骤执行结果（累积）
session["current_commands"] = {...}   # 命令重试后的修改版本
session["retry_counts"] = {...}       # 重试计数
session["retry_history"] = {...}      # 重试命令历史
session["pending_choice_context"] = {...}  # 等待用户选择的上下文
```

#### 7.2.2 上下文释放时机

Session 在以下 **5 个时机** 被删除（`del self.active_sessions[session_id]`）：

| 触发场景 | 代码位置 | 说明 |
|---------|---------|------|
| ① 任务正常完成（无执行步骤） | `advanced_agent.py:718` | 纯问答任务完成后 |
| ② 任务正常完成（有执行步骤，总结后） | `advanced_agent.py:1010` | 所有步骤执行完 + 生成总结后 |
| ③ 用户取消选择 | `advanced_agent.py:283` | 用户在 USER_CHOICE 中取消 |
| ④ 主动取消任务 | `advanced_agent.py:1017` | 调用 `cancel_task()` |
| ⑤ 任务终止（达到最大重试等） | `execution_handler.py:958` | `_terminate_task()` 中 |

**结论**：单次任务的上下文在任务完成/取消/终止后立即释放。这是合理的——单次任务的临时状态不需要持久化。

#### 7.2.3 Level 1 已解决的问题（Phase A-C 已实施）

通过前面的 Phase A（BUG 修复）、Phase B（系统信息传递 + 上下文增强）和 Phase C（步骤衔接评估），单次任务内各 Phase 之间的上下文传递问题已基本解决：

- ✅ 系统信息全链路传递
- ✅ 错误分析获得完整计划和执行历史
- ✅ 命令重生成获得前序执行结果
- ✅ 步骤间动态调整命令

### 7.3 Level 2：跨任务上下文（现状分析与问题）

#### 7.3.1 当前状态

```
用户在同一个终端 Tab 中：

提问 1: "查看 Nginx 配置"
  → session_id = "ssh-session-abc"
  → 创建 active_sessions["ssh-session-abc"]
  → 执行完毕 → del active_sessions["ssh-session-abc"]  ← 上下文全部丢失

提问 2: "修改刚才看到的 server_name 为 example.com"
  → session_id = "ssh-session-abc"（同一个 tab，同一个 session_id）
  → active_sessions 中找不到 → 创建全新的 session
  → AI 完全不知道"刚才"看到了什么 ← 无法关联
```

#### 7.3.2 关键代码分析

**客户端**：`session_id` 由客户端生成，同一个终端 Tab 内保持不变：

```typescript
// AIAgent.ts:100
sessionId: this.config.sessionId,  // 跟随 Tab 生命周期，不随提问变化
```

**服务端**：每次提问时检查 `session_id` 是否存在：

```python
# advanced_agent.py:513
if session_id not in self.active_sessions:
    # 创建新 session（每次任务完成后 session 已被删除，所以这里总是 True）
    self.active_sessions[session_id] = {...}
```

**`session["history"]` 的悖论**：

```python
# advanced_agent.py:548-552
user_message = {"role": "user", "content": prompt}
session["history"].append(user_message)
```

代码中有 `history` 字段并且每次提问都 append，看似支持多轮对话。但由于 session 在任务完成后被删除，history 也随之丢失。即使 session 没有被删除，`history` 也**从未被任何 AI 调用使用**——它只是被写入，从未被读取。

#### 7.3.3 问题总结

| 问题 | 原因 | 影响 |
|------|------|------|
| 跨任务上下文完全丢失 | session 在任务完成后被删除 | 用户无法进行关联提问 |
| history 字段未被消费 | 没有 AI 调用读取 history | 即使保留 session 也无效 |
| 前次任务结果不可查 | results 随 session 删除 | AI 不知道之前做了什么 |

### 7.4 Level 2 解决方案：跨任务上下文持久化

#### 7.4.1 设计原则

```
1. 最小改动原则  — 不改变现有 session 删除逻辑（单次任务仍正常清理）
2. 分层存储原则  — 任务临时状态（plan/retry等）仍随 session 删除，
                   但 "交互摘要" 持久化到独立存储
3. 客户端无需改动 — 仍然只传 session_id，不需要客户端管理历史
4. Token 可控    — 跨任务上下文通过摘要而非原始数据注入，避免 Token 爆炸
```

#### 7.4.2 架构：引入 SessionMemory

在 `active_sessions`（短期、任务级）之外，新增 `session_memory`（长期、会话级）：

```python
# 新增：会话记忆存储（按 session_id 索引，跨任务保持）
session_memory: Dict[str, SessionMemory] = {}

class SessionMemory:
    """跨任务的会话记忆 — 跟随终端 Tab 生命周期"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.created_at = datetime.now()
        self.last_active_at = datetime.now()
        self.task_summaries: List[TaskSummary] = []  # 历史任务摘要
        self.system_info: Optional[str] = None       # 缓存系统信息

    def add_task_summary(self, summary: TaskSummary):
        """添加任务摘要（任务完成时调用）"""
        self.task_summaries.append(summary)
        self.last_active_at = datetime.now()
        # 控制历史长度，只保留最近 N 次任务
        if len(self.task_summaries) > MAX_TASK_HISTORY:
            self.task_summaries = self.task_summaries[-MAX_TASK_HISTORY:]

    def get_context_for_ai(self, max_tokens: int = 1500) -> str:
        """生成供 AI 使用的历史上下文摘要"""
        if not self.task_summaries:
            return ""

        lines = ["**之前的操作记录**（同一会话中的历史任务）："]
        total_len = 0
        # 从最近的任务开始，倒序添加
        for summary in reversed(self.task_summaries):
            entry = summary.to_context_string()
            if total_len + len(entry) > max_tokens * 4:  # 粗略估算
                lines.append("  ... (更早的历史已省略)")
                break
            lines.append(entry)
            total_len += len(entry)

        return "\n".join(lines)


class TaskSummary:
    """单次任务的摘要（精简版，用于跨任务上下文）"""

    def __init__(
        self,
        task_id: str,
        user_prompt: str,
        plan_description: str,
        steps_summary: List[Dict[str, str]],  # [{command, output_summary, success}]
        final_conclusion: str,                  # AI 总结的结论
        timestamp: datetime,
    ):
        self.task_id = task_id
        self.user_prompt = user_prompt
        self.plan_description = plan_description
        self.steps_summary = steps_summary
        self.final_conclusion = final_conclusion
        self.timestamp = timestamp

    def to_context_string(self) -> str:
        """生成上下文文本"""
        lines = [
            f"  [{self.timestamp.strftime('%H:%M')}] 用户提问：{self.user_prompt}",
            f"    目标：{self.plan_description}",
        ]
        for step in self.steps_summary:
            status = "✅" if step.get("success") else "❌"
            cmd = step.get("command", "")
            output = step.get("output_summary", "")
            lines.append(f"    {status} {cmd}")
            if output:
                lines.append(f"       → {output}")
        if self.final_conclusion:
            lines.append(f"    结论：{self.final_conclusion}")
        return "\n".join(lines)
```

#### 7.4.3 数据流变化

```
任务完成前（现有逻辑不变）：
  active_sessions[session_id] → 存储任务级临时状态

任务完成时（新增步骤）：
  1. 从 session 中提取 TaskSummary（精简摘要）
  2. 保存到 session_memory[session_id]
  3. 删除 active_sessions[session_id]（现有逻辑不变）

新任务开始时（新增步骤）：
  1. 创建新的 active_sessions[session_id]（现有逻辑不变）
  2. 从 session_memory[session_id] 读取历史上下文
  3. 将历史上下文注入 Phase 1（需求分析）的提示词
```

#### 7.4.4 改动清单

**服务端改动**：

| 改动项 | 涉及文件 | 改动量 | 说明 |
|--------|---------|-------|------|
| 新增 `SessionMemory` 和 `TaskSummary` 类 | `advanced_agent_prompts.py` 或新文件 | ~80 行 | 跨任务上下文存储 |
| 任务完成时保存 TaskSummary | `advanced_agent.py` (删除 session 前) | ~20 行 | 在 5 个删除点前提取摘要 |
| 新任务开始时注入历史上下文 | `advanced_agent.py` (process_advanced_task) | ~10 行 | 读取 session_memory 并传入分析 |
| 修改 Phase 1 提示词支持历史上下文 | `advanced_agent_prompts.py` | ~10 行 | 在分析提示词中添加历史部分 |
| SessionMemory 过期清理 | `advanced_agent.py` | ~15 行 | 定期清理不活跃的 session_memory |

**客户端改动**：**无**。客户端已经在每次提问中携带同一个 `session_id`，无需修改。

#### 7.4.5 关键实现细节

**1. 任务完成时提取摘要**（在 `del self.active_sessions[session_id]` 之前）：

```python
# advanced_agent.py — 在每个 del active_sessions 之前调用
def _save_task_to_memory(self, session_id: str):
    """将当前任务的摘要保存到会话记忆"""
    session = self.active_sessions.get(session_id)
    if not session:
        return

    # 提取步骤摘要（精简版）
    steps_summary = []
    for r in session.get("results", []):
        output = r.get("output", "") or ""
        # 只保留关键输出（前 200 字符）
        output_summary = output[:200].strip()
        if len(output) > 200:
            output_summary += "..."
        steps_summary.append({
            "command": r.get("command", ""),
            "output_summary": output_summary,
            "success": r.get("success", False),
        })

    task_summary = TaskSummary(
        task_id=session.get("task_id", ""),
        user_prompt=session.get("original_prompt", ""),
        plan_description=session.get("plan", {}).get("description", ""),
        steps_summary=steps_summary,
        final_conclusion="",  # 如果有 final_summary 可以在这里保存
        timestamp=datetime.now(),
    )

    # 保存到 session_memory
    if session_id not in self.session_memory:
        self.session_memory[session_id] = SessionMemory(session_id)
    self.session_memory[session_id].add_task_summary(task_summary)

    # 缓存系统信息（首次保存后复用）
    if not self.session_memory[session_id].system_info:
        ctx = session.get("context", {})
        if ctx.get("os_type"):
            self.session_memory[session_id].system_info = build_system_info(context=ctx)
```

**2. 新任务开始时注入历史上下文**：

```python
# advanced_agent.py:process_advanced_task — 在 Phase 1 之前
memory = self.session_memory.get(session_id)
history_context = ""
if memory:
    history_context = memory.get_context_for_ai(max_tokens=1500)

# 传入 Phase 1 分析
async for chunk_data in self._analyze_requirement(
    task_id, prompt, context, model, current_session_files, ui_language,
    history_context=history_context,  # 新增参数
):
    ...
```

**3. Phase 1 提示词中使用历史上下文**：

```python
# advanced_agent_prompts.py — build_requirement_analysis_user_prompt
if history_context:
    prompt += f"""

**会话历史**：
用户在同一个终端会话中之前已经执行过以下操作，当前提问可能与之相关：
{history_context}

请在分析需求时参考以上历史操作。如果当前提问引用了"刚才"、"之前"、"上面"等词语，
请结合历史上下文理解用户意图。如果当前提问与历史无关，则忽略历史信息。
"""
```

**4. SessionMemory 过期清理**：

```python
# 在 process_advanced_task 入口处，顺便清理过期的 session_memory
MAX_MEMORY_AGE_HOURS = 24  # 最大保持 24 小时
MAX_TASK_HISTORY = 10      # 每个 session 最多保留 10 次任务摘要

def _cleanup_stale_memory(self):
    """清理过期的会话记忆"""
    now = datetime.now()
    stale_ids = [
        sid for sid, mem in self.session_memory.items()
        if (now - mem.last_active_at).total_seconds() > MAX_MEMORY_AGE_HOURS * 3600
    ]
    for sid in stale_ids:
        del self.session_memory[sid]
```

#### 7.4.6 Token 消耗评估

| 场景 | 额外 Token | 说明 |
|------|-----------|------|
| 首次提问（无历史） | 0 | 没有历史上下文注入 |
| 第二次提问（1次历史） | ~200-400 | 一个任务摘要约 200 tokens |
| 第五次提问（4次历史） | ~800-1500 | 多个摘要叠加，但有 max_tokens 限制 |

通过 `max_tokens=1500` 限制，最坏情况下跨任务上下文约增加 1500 tokens（仅在 Phase 1 注入），相对于整体任务 Token 消耗（通常 5000-15000）是可控的。

#### 7.4.7 典型场景验证

**场景 1：关联提问**
```
提问 1: "查看 /etc/nginx/nginx.conf 配置"
  → 执行 cat /etc/nginx/nginx.conf → 输出配置内容
  → TaskSummary 保存：{prompt: "查看配置", output_summary: "server_name app.example.com; ..."}

提问 2: "把刚才看到的 server_name 改成 new.example.com"
  → Phase 1 分析时，注入 history_context:
    "之前的操作：查看 /etc/nginx/nginx.conf → server_name app.example.com; ..."
  → AI 理解"刚才"指的是上一个任务的输出
  → 生成正确的 sed 命令替换 server_name
```

**场景 2：无关提问**
```
提问 1: "查看磁盘使用情况"
提问 2: "重启 MySQL 服务"（与提问 1 无关）
  → Phase 1 分析时注入历史，但 AI 判断当前提问与历史无关
  → 正常执行，历史不影响当前任务
```

**场景 3：多次关联操作**
```
提问 1: "查看 MySQL 状态"
提问 2: "查看 MySQL 错误日志最后 50 行"
提问 3: "根据刚才的错误日志，修复 MySQL 配置"
  → 提问 3 的 history_context 包含提问 1 和 2 的摘要
  → AI 能看到 MySQL 状态 + 错误日志内容
  → 生成正确的修复命令
```

### 7.5 是否需要客户端提交历史记录？

**答案：不需要。**

原因：
1. 服务端已经拥有执行历史的完整信息（命令 + 输出），客户端只有 AI 的文本回答
2. 通过 `SessionMemory` 在服务端维护摘要，比客户端传输大量历史数据更高效
3. 客户端的 `session_id` 已经是天然的会话标识，无需额外机制
4. 减少 WebSocket 传输负担（不需要每次提问都发送完整历史）

唯一需要客户端配合的场景：**用户主动清除会话历史**（例如点击"新建对话"按钮），此时客户端可以：
- 方案 A：生成新的 `session_id`（简单、推荐）
- 方案 B：发送 `CLEAR_HISTORY` 消息（需要新协议，不推荐）

---

## 八、资源泄漏分析与修复

### 8.1 泄漏点汇总

| # | 泄漏资源 | 存储位置 | 正常清理时机 | 泄漏场景 | 严重程度 |
|---|---------|---------|------------|---------|---------|
| 1 | `active_tasks[task_id]` | `websocket.py` 模块级全局字典 | 任务完成时 `del active_tasks[task_id]` | 用户发新提问但未完成旧任务 | **高（内存泄漏）** |
| 2 | `active_sessions[session_id]` | `advanced_agent.py` 实例字典 | 任务完成/取消/终止 | 用户发新提问但未完成旧任务（旧 session 被"污染式复用"） | **高（数据污染+逻辑错误）** |
| 3 | `active_tasks` + `active_sessions` | 同上 | 同上 | WebSocket 断开（关闭浏览器/Tab） | **高（内存泄漏）** |
| 4 | `frontend_to_server_task_id` | `ConnectionManager` 实例字典 | 仅 `handle_stop_task` 中手动清理 | WebSocket 断开时未清理 | 中（内存泄漏） |

### 8.2 泄漏场景详解

#### 场景 1：用户发新提问但未完成旧任务

```
T1: 用户发提问 1 → handle_question()
    → task_id_1 = "abc123"
    → active_tasks["abc123"] = {session_id: "ssh-abc", mode: "agent", user_id: "u1"}
    → process_advanced_task() → active_sessions["ssh-abc"] 创建
    → Phase 1/2 完成 → 发送 EXECUTE_REQUEST(step 0) → 等待客户端...
    → handle_question() 的 finally 块执行:
      manager.remove_task("u1", "abc123")    ← 从 user_tasks 移除
      task_completed=False → active_tasks["abc123"] 保留 ← 等待后续 CONFIRM

T2: 客户端执行 step 0 → CONFIRM_EXECUTE → 处理结果 → 发送 EXECUTE_REQUEST(step 1) → 等待...

T3: 用户不继续 step 1，直接发新提问 2 → handle_question()
    → task_id_2 = "def456"
    → active_tasks["def456"] = {session_id: "ssh-abc", mode: "agent", user_id: "u1"}
    → process_advanced_task(session_id="ssh-abc")
      → session_id IN active_sessions → 复用旧 session! ← 数据污染

结果：
  active_tasks["abc123"] → 永远不会被清理（内存泄漏）
  active_sessions["ssh-abc"] → 被复用，含旧的 plan/results/task_id
```

#### 场景 2：WebSocket 断开（客户端关闭）

```
disconnect(user_id) 被调用:

当前清理逻辑:
  for task_id in self.user_tasks[user_id]:     ← 可能为空！
      aiops_agent_service.cancel_task(task_id)  ← 只清理了 aiops_agent
  del self.user_tasks[user_id]

问题 1: user_tasks 可能为空
  → handle_question() 的 finally 已执行 manager.remove_task()
  → 等待 CONFIRM 的任务已不在 user_tasks 中
  → disconnect 的循环找不到这些任务

问题 2: 只调用 aiops_agent_service.cancel_task
  → agent 模式的任务 → advanced_aiops_agent.cancel_task(session_id) 未被调用
  → code 模式的任务 → claude_code_agent.cancel_task(task_id) 未被调用
  → active_sessions 中的 session 不会被清理

问题 3: active_tasks 全局字典未被清理
  → active_tasks[task_id] 永远留在内存中

问题 4: cancel_task 参数不匹配
  → aiops_agent_service.cancel_task(task_id)   ← 用 task_id
  → advanced_aiops_agent.cancel_task(session_id) ← 用 session_id
  → 即使加上调用也对不上
```

#### 场景 3：handle_stop_task 模式缺失

```python
# websocket.py:569 — 当前代码
success = aiops_agent_service.cancel_task(task_id)  # ← 只调用了 aiops_agent

# 问题：agent 模式的任务，应该调用 advanced_aiops_agent.cancel_task(session_id)
# 但此处没有区分模式，也没有 session_id 信息
```

### 8.3 关键约束：Go 中间件的 WebSocket 重连行为

**发现**：Go 中间件（termcat_server）在每次客户端交互时都会创建新的 WebSocket 连接到 Python agent_server。这意味着：

```
Step 0 执行:  WS connected → CONFIRM_EXECUTE → WS disconnected
Step 1 执行:  WS connected → CONFIRM_EXECUTE → WS disconnected
Step 2 执行:  WS connected → CONFIRM_EXECUTE → WS disconnected
```

**影响**：`disconnect()` 在正常任务执行过程中也会被反复调用。如果 disconnect 清理了 `active_sessions`，正在执行的任务就会中断（Session not found）。

**设计原则**：`disconnect()` 只清理连接状态（`active_connections`、`user_tasks`），不触碰任务资源。任务资源的清理依赖：
1. `handle_question()` — 用户发新提问时，清理同 session 的残留任务
2. `process_advanced_task()` — 始终创建新 session，旧 session 被覆盖
3. `handle_stop_task()` — 用户主动停止任务

### 8.4 修复方案

#### 修复 1：`disconnect()` — 仅清理连接状态

```python
def disconnect(self, user_id: str):
    """断开连接，仅清理连接状态。
    不清理 active_tasks/active_sessions，因为 Go 中间件每次交互都会重建 WS。
    任务资源清理由 handle_question/handle_stop_task/process_advanced_task 负责。
    """
    if user_id in self.active_connections:
        del self.active_connections[user_id]
    if user_id in self.user_tasks:
        del self.user_tasks[user_id]
```

#### 修复 2：`handle_question()` — 新提问前清理旧任务

```python
# 在生成新 task_id 之前，清理同 session_id 的残留任务
if session_id:
    stale_ids = [
        tid for tid, info in active_tasks.items()
        if info.get("session_id") == session_id
    ]
    for stale_tid in stale_ids:
        stale_info = active_tasks.pop(stale_tid)
        _cleanup_task_by_mode(stale_info)
```

#### 修复 3：`handle_stop_task()` — 按模式调用正确的 cancel

```python
# 从 active_tasks 获取任务信息
task_info = active_tasks.pop(task_id, None)
if task_info:
    _cleanup_task_by_mode(task_info)
else:
    # 兜底：尝试用 task_id 清理
    aiops_agent_service.cancel_task(task_id)
```

#### 修复 4：`process_advanced_task()` — 始终创建新 session

```python
# 如果存在旧 session，先清理
if session_id in self.active_sessions:
    old_session = self.active_sessions[session_id]
    logger.warning(
        event="advanced_agent.session.stale_cleanup",
        msg="Cleaning up stale session before new task",
        old_task_id=old_session.get("task_id"),
        new_task_id=task_id,
    )
    del self.active_sessions[session_id]

# 始终创建新 session
self.active_sessions[session_id] = {...}
```

#### 公共辅助函数：`_cleanup_task_by_mode()`

```python
def _cleanup_task_by_mode(task_info: Dict[str, Any]):
    """根据任务模式调用对应的清理方法"""
    mode = task_info.get("mode")
    session_id = task_info.get("session_id")
    task_id = task_info.get("task_id")  # handle_stop_task 场景

    if mode == "agent" and session_id:
        advanced_aiops_agent.cancel_task(session_id)
    elif mode == "code":
        if task_id:
            claude_code_agent.cancel_task(task_id)
    else:
        if task_id:
            aiops_agent_service.cancel_task(task_id)
```

### 8.5 改动清单

| 修复项 | 涉及文件 | 改动量 | 说明 |
|--------|---------|-------|------|
| `_cleanup_task_by_mode()` 公共函数 | `websocket.py` | ~15 行 | 按模式调用正确的清理方法 |
| `disconnect()` 简化为仅清理连接 | `websocket.py` | ~8 行 | 不触碰 active_tasks/sessions（因为 WS 每次交互都重连） |
| `handle_question()` 旧任务清理 | `websocket.py` | ~15 行 | 新提问前清理同 session 残留（真正的清理点） |
| `handle_stop_task()` 多模式支持 | `websocket.py` | ~10 行 | 根据 mode 调用正确 cancel + task_id 兜底查找 |
| `process_advanced_task()` 强制刷新 | `advanced_agent.py` | ~15 行 | 旧 session 存在时先清理，始终创建新 session |
| `cancel_task_by_task_id()` 兜底方法 | `advanced_agent.py` | ~5 行 | 通过 task_id 反查 session_id 并取消 |

**总改动量**：~68 行，客户端无需改动。

---

## 九、更新后的实施计划

### 已完成（Phase A-C）

| 阶段 | 状态 | 说明 |
|------|------|------|
| Phase A (P0) | ✅ 已完成 | 修复 retry_history key BUG |
| Phase B1 (P1) | ✅ 已完成 | 系统信息全链路传递 |
| Phase B2 (P1) | ✅ 已完成 | 增大错误分析截断阈值 200→800 |
| Phase B3 (P1) | ✅ 已完成 | 增强命令重生成上下文 |
| Phase C (P2) | ✅ 已完成 | 步骤衔接评估（Step Transition Evaluation） |

### 已完成（Phase D — 资源泄漏修复）

| 阶段 | 状态 | 说明 |
|------|------|------|
| D1 | ✅ 已完成 | `_cleanup_task_by_mode()` 按模式清理 |
| D2 | ✅ 已完成 | `disconnect()` 简化为仅清理连接（不触碰任务资源，因 WS 每次交互重连） |
| D3 | ✅ 已完成 | `handle_question()` 新提问前清理同 session 残留任务 |
| D4 | ✅ 已完成 | `handle_stop_task()` 多模式支持 + task_id 兜底查找 |
| D5 | ✅ 已完成 | `process_advanced_task()` 始终创建新 session |
| D6 | ✅ 已完成 | `cancel_task_by_task_id()` 兜底取消方法 |

### 已完成（Phase F — 步骤衔接用户确认）

| 阶段 | 状态 | 说明 |
|------|------|------|
| F1 | ✅ 已完成 | `STEP_TRANSITION_SYSTEM_PROMPT` 增加用户指定参数保护规则（rule 5） |
| F2 | ✅ 已完成 | `build_step_transition_user_prompt` JSON 格式扩展 `need_user_choice`、`issue`、`question`、`options` 字段 |
| F3 | ✅ 已完成 | `_handle_execution_success()` 检测 `need_user_choice=true` 时发送 `USER_CHOICE_REQUEST`，复用现有用户选择流程 |

**问题背景**：Step Transition Evaluation 会在步骤执行成功后评估下一步命令。当检测到下一步命令会失败（如 Python 1.10 不存在），
之前会直接将命令修改为 AI 认为合理的值（如 3.10），跳过用户确认。这违反了"用户明确指定的参数不能被 AI 擅自修改"的原则。

**修复方案**：当调整涉及修改用户明确指定的参数时，AI 必须返回 `need_user_choice=true` + 选项列表，
由 `_handle_execution_success()` 发送 `USER_CHOICE_REQUEST` 给客户端，复用已有的 `handle_user_choice_response` 流程处理用户选择。

### 待实施（Phase E — 跨任务上下文）

| 步骤 | 改动 | 涉及文件 | 改动量 |
|------|------|---------|-------|
| E1 | 新增 `SessionMemory` 和 `TaskSummary` 类 | 新文件 `advanced_agent_session_memory.py` 或 `advanced_agent_prompts.py` | ~100 行 |
| E2 | 在 `AdvancedAIOpsAgent.__init__` 中初始化 `self.session_memory = {}` | `advanced_agent.py` | 2 行 |
| E3 | 在 5 个 session 删除点前调用 `_save_task_to_memory()` | `advanced_agent.py`, `execution_handler.py` | ~30 行 |
| E4 | 在 `process_advanced_task` 中读取 `session_memory` 并传入 Phase 1 | `advanced_agent.py` | ~10 行 |
| E5 | 修改 Phase 1 分析提示词支持 `history_context` 参数 | `advanced_agent_prompts.py` | ~15 行 |
| E6 | 添加 `_cleanup_stale_memory()` 定期清理 | `advanced_agent.py` | ~15 行 |

---

## 十、总结

### 核心问题

上下文管理存在三个层面的问题：

1. **单次任务内（Level 1）**：各阶段 AI 调用完全独立，系统信息丢失、执行历史截断、计划静态不调整 → **已通过 Phase A-C 解决**
2. **资源生命周期管理**：任务中断时 `active_tasks` 和 `active_sessions` 泄漏，WebSocket 断开时清理不完整 → **Phase D 修复**
3. **步骤衔接用户确认**：Step Transition 评估发现需要修改用户指定参数时，会擅自替换而非征求用户意见 → **Phase F 修复**
4. **跨任务间（Level 2）**：session 在任务完成后被删除，`history` 字段虽有累积但从未被消费 → **待 Phase E 实施**

### 优化全景

| 层级 | 优化前 | 优化后 |
|------|-------|--------|
| Level 1（任务内） | 静态计划 + 独立 AI 调用 + 信息截断 | 动态调整 + 全链路上下文 + 系统信息传递 |
| 资源管理 | 中断/断开时泄漏，session 被污染式复用 | 全面清理 + 按模式 cancel + 强制新建 session |
| 用户交互 | Step Transition 擅自替换用户指定参数 | 检测到用户参数变更时发 USER_CHOICE_REQUEST 征求确认 |
| Level 2（跨任务） | 任务完成即丢弃所有上下文 | SessionMemory 持久化摘要，支持关联提问 |

### 风险控制

- **渐进式实施**：P0 → P1 → P2 → 泄漏修复 → Level 2，每个阶段独立可交付
- **向后兼容**：客户端无需改动，服务端协议不变
- **成本可控**：Level 2 上下文注入通过摘要控制在 ~1500 tokens 内
- **可回滚**：每个改动点都可独立回滚
- **自动清理**：SessionMemory 24h 过期 + 最多 10 次任务历史
