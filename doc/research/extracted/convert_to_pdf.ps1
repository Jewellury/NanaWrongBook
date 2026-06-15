param(
    [string]$DocxPath,
    [string]$PdfPath
)

Write-Output "Converting: $DocxPath -> $PdfPath"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0  # wdAlertsNone

try {
    $doc = $word.Documents.Open($DocxPath, $false, $true, $false)
    # Save as PDF - Format type 17 = PDF
    $doc.SaveAs([ref]$PdfPath, [ref]17)
    $doc.Close()
    Write-Output "Success: PDF saved to $PdfPath"
} catch {
    Write-Error "Failed: $_"
} finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
