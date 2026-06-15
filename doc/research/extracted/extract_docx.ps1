param(
    [string]$DocxPath,
    [string]$OutDir
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($DocxPath)

# List all entries
Write-Output "=== ALL ENTRIES ==="
foreach ($entry in $zip.Entries) {
    Write-Output "$($entry.FullName) | $($entry.Length)"
}

# Extract images from word/media/
Write-Output "`n=== EXTRACTING MEDIA ==="
foreach ($entry in $zip.Entries) {
    if ($entry.FullName -match 'word/media/') {
        $fileName = [System.IO.Path]::GetFileName($entry.FullName)
        $outPath = Join-Path $OutDir $fileName
        $stream = $entry.Open()
        $fs = [System.IO.File]::Create($outPath)
        $stream.CopyTo($fs)
        $fs.Close()
        $stream.Close()
        Write-Output "Extracted: $fileName"
    }
}

# Extract document.xml as text (strip XML)
$docEntry = $zip.GetEntry('word/document.xml')
$stream = $docEntry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$xml = $reader.ReadToEnd()
$reader.Close()
$zip.Dispose()

# Simple XML tag stripping
$text = $xml -replace '<[^>]+>', "`n"
$text = [System.Text.RegularExpressions.Regex]::Replace($text, "`n`n+", "`n")
$textPath = Join-Path $OutDir "document-text.txt"
[System.IO.File]::WriteAllText($textPath, $text, [System.Text.Encoding]::UTF8)
Write-Output "`nText written to: $textPath ($($text.Length) chars)"
