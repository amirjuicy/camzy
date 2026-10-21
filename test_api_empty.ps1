$body = @{items=@()} | ConvertTo-Json -Compress
try {
    $response = Invoke-WebRequest -Method POST -Uri 'http://localhost:3000/api/orders' -ContentType 'application/json' -Body $body
} catch {
    $response = $_.Exception.Response
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $content = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
}
$response.StatusCode
$response.StatusDescription
$content