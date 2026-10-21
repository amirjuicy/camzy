[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$body = @{items=@()} | ConvertTo-Json -Compress
try {
    $response = Invoke-WebRequest -Method POST -Uri 'http://localhost:3000/api/orders' -ContentType 'application/json' -Body $body
    Write-Host "Status: $($response.StatusCode)"
    Write-Host "Content: $($response.Content)"
} catch {
    Write-Host "Error Status: $($_.Exception.Response.StatusCode)"
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
    $content = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    Write-Host "Error Content: $content"
}