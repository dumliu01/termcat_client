快速制作 macOS .icns 图标步骤
准备原始图片：准备一张 

 像素的 PNG 图片，命名为 icon.png。
创建图标文件夹：在终端运行以下命令创建一个专门存放图标的文件夹：
bash
mkdir myapp.iconset
生成不同尺寸图片：使用终端的 sips 命令（流图像处理系统）将图片生成苹果要求的不同分辨率文件：
bash
sips -z 16 16     icon.png --out myapp.iconset/icon_16x16.png
sips -z 32 32     icon.png --out myapp.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out myapp.iconset/icon_32x32.png
sips -z 64 64     icon.png --out myapp.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out myapp.iconset/icon_128x128.png
sips -z 256 256   icon.png --out myapp.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out myapp.iconset/icon_256x256.png
sips -z 512 512   icon.png --out myapp.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out myapp.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out myapp.iconset/icon_512x512@2x.png
封装为 .icns 文件：运行以下命令，将图标文件夹转换为最终的 .icns 文件：
bash
iconutil -c icns myapp.iconset -o AppIcon.icns
 
小弟调调
小弟调调
补充说明
如何修改 App 图标：右键点击 App -> “显示简介” -> 将新的 .icns 文件拖动到左上角的小图标上进行替换。
如何查看现有图标：右键点击应用程序 -> “显示包内容” -> 进入 Contents/Resources 目录即可找到现有的 .icns 文件