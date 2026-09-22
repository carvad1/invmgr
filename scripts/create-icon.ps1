Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$assetDirectory = Join-Path $projectRoot 'assets'
[IO.Directory]::CreateDirectory($assetDirectory) | Out-Null
$bitmap = [Drawing.Bitmap]::new(256, 256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::Transparent)
$shape = [Drawing.Drawing2D.GraphicsPath]::new()
$shape.AddArc(0, 0, 76, 76, 180, 90)
$shape.AddArc(180, 0, 76, 76, 270, 90)
$shape.AddArc(180, 180, 76, 76, 0, 90)
$shape.AddArc(0, 180, 76, 76, 90, 90)
$shape.CloseFigure()
$brush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(19, 127, 111))
$graphics.FillPath($brush, $shape)
$pen = [Drawing.Pen]::new([Drawing.Color]::White, 13)
$pen.StartCap = [Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
$points = [Drawing.Point[]]@([Drawing.Point]::new(53, 164), [Drawing.Point]::new(104, 112), [Drawing.Point]::new(140, 143), [Drawing.Point]::new(204, 78))
$graphics.DrawLines($pen, $points)
$graphics.DrawLine($pen, 164, 78, 204, 78)
$graphics.DrawLine($pen, 204, 78, 204, 119)
$stream = [IO.MemoryStream]::new()
$bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
$bytes = $stream.ToArray()
[IO.File]::WriteAllBytes((Join-Path $assetDirectory 'icon.png'), $bytes)
$file = [IO.File]::Create((Join-Path $assetDirectory 'icon.ico'))
$writer = [IO.BinaryWriter]::new($file)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$bytes.Length); $writer.Write([uint32]22)
$writer.Write($bytes)
$writer.Dispose(); $stream.Dispose(); $pen.Dispose(); $brush.Dispose(); $shape.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
