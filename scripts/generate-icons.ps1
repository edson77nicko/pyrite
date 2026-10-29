Add-Type -AssemblyName System.Drawing

$inputPath = Join-Path $PSScriptRoot "..\public\icone_instalador.jpg"
$outputPngPath = Join-Path $PSScriptRoot "..\public\icone_instalador.png"
$outputIconPng = Join-Path $PSScriptRoot "..\public\icon.png"
$outputIcoPath = Join-Path $PSScriptRoot "..\public\icon.ico"
$outputFaviconIco = Join-Path $PSScriptRoot "..\public\favicon.ico"

Write-Host "Carregando imagem de: $inputPath"
$sourceImg = [System.Drawing.Bitmap]::FromFile($inputPath)
$origWidth = $sourceImg.Width
$origHeight = $sourceImg.Height
Write-Host "Dimensoes originais: $origWidth x $origHeight"

# Criar imagem arredondada com anti-aliasing
function Get-RoundedBitmap([System.Drawing.Bitmap]$source, [int]$size, [float]$radiusRatio) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $radius = $size * $radiusRatio
    $diameter = $radius * 2

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    
    # 4 cantos arredondados
    $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
    $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
    $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()

    $g.SetClip($path)
    $g.DrawImage($source, 0, 0, $size, $size)
    $g.Dispose()
    $path.Dispose()

    return $bmp
}

# Criar a versao principal arredondada (1024x1024 com raio de 18% para padrao moderno de mercado)
$radiusRatio = 0.18
$roundedMain = Get-RoundedBitmap $sourceImg 1024 $radiusRatio
$roundedMain.Save($outputPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$roundedMain.Save($outputIconPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Salvo PNG arredondado em: $outputPngPath"

# Gerar tamanhos para o arquivo ICO: 256, 128, 64, 48, 32, 16
$sizes = @(256, 128, 64, 48, 32, 16)
$pngBytesList = @()

foreach ($sz in $sizes) {
    $resized = Get-RoundedBitmap $sourceImg $sz $radiusRatio
    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytesList += ,@($sz, $ms.ToArray())
    $ms.Dispose()
    $resized.Dispose()
}

$sourceImg.Dispose()
$roundedMain.Dispose()

# Montar arquivo ICO (formato binario padrao Windows)
function Build-IcoFile($pngList, $destPath) {
    $count = $pngList.Count
    $headerSize = 6
    $entrySize = 16
    $dataOffset = $headerSize + ($count * $entrySize)

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    # ICONDIR
    $bw.Write([uint16]0) # Reserved
    $bw.Write([uint16]1) # Type: 1 = ICO
    $bw.Write([uint16]$count) # Image count

    # Escrever ICONDIRENTRY
    $currentOffset = $dataOffset
    foreach ($item in $pngList) {
        $sz = $item[0]
        $bytes = $item[1]
        $bWidth = if ($sz -ge 256) { 0 } else { [byte]$sz }
        $bHeight = if ($sz -ge 256) { 0 } else { [byte]$sz }

        $bw.Write([byte]$bWidth)
        $bw.Write([byte]$bHeight)
        $bw.Write([byte]0) # Colors (0 = > 8bpp)
        $bw.Write([byte]0) # Reserved
        $bw.Write([uint16]1) # Color planes
        $bw.Write([uint16]32) # Bits per pixel
        $bw.Write([uint32]$bytes.Length) # Image size in bytes
        $bw.Write([uint32]$currentOffset) # Offset

        $currentOffset += $bytes.Length
    }

    # Escrever dados das imagens (PNG)
    foreach ($item in $pngList) {
        $bytes = $item[1]
        $bw.Write($bytes)
    }

    $bw.Flush()
    [System.IO.File]::WriteAllBytes($destPath, $ms.ToArray())
    $bw.Dispose()
    $ms.Dispose()
    Write-Host "Salvo arquivo ICO em: $destPath ($count resolucoes)"
}

Build-IcoFile $pngBytesList $outputIcoPath
Build-IcoFile $pngBytesList $outputFaviconIco
Write-Host "Icones gerados com sucesso!"
