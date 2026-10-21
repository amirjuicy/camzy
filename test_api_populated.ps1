$body = @{
    items = @(@{productId=1; quantity=1})
    address = "Test address, Tehran, Iran"
    paymentMethod = "online"
} | ConvertTo-Json -Compress
Invoke-WebRequest -Method POST -Uri 'http://localhost:3000/api/orders' -ContentType 'application/json' -Body $body