$body = @{
    slides = @(
        @{
            id = 1
            image_desktop = ''
            image_mobile = ''
            image_position = 'center'
            badge = 'تست'
            title = 'تست اسلاید ۱'
            text = 'توضیحات تست'
            btn1_text = 'دکمه ۱'
            btn1_url = '#btn1'
            btn2_text = 'دکمه ۲'
            btn2_url = '#btn2'
            slide_type = 'content'
            link_url = ''
            show_badge = 1
            badge_icon = ''
            show_title = 1
            show_text = 1
            show_image = 1
            image_size = 'medium'
            show_btn1 = 1
            show_btn2 = 1
            content_position = 'right'
            is_active = 1
            show_mobile = 0
            sort_order = 1
        },
        @{
            id = 2
            image_desktop = ''
            image_mobile = ''
            image_position = 'center'
            badge = 'تست ۲'
            title = 'تست اسلاید ۲'
            text = 'توضیحات تست ۲'
            btn1_text = 'دکمه ۱'
            btn1_url = '#btn1'
            btn2_text = 'دکمه ۲'
            btn2_url = '#btn2'
            slide_type = 'content'
            link_url = ''
            show_badge = 1
            badge_icon = ''
            show_title = 1
            show_text = 1
            show_image = 1
            image_size = 'medium'
            show_btn1 = 1
            show_btn2 = 1
            content_position = 'right'
            is_active = 1
            show_mobile = 1
            sort_order = 2
        }
    )
} | ConvertTo-Json -Depth 5 -Compress

Invoke-RestMethod -Method Put -Uri http://127.0.0.1:3000/api/admin/hero-slides -Headers @{'Content-Type'='application/json'} -Body $body | ConvertTo-Json -Depth 5