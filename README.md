# Pic Swipe

[Substack article](https://pokelord.substack.com/p/pic-swipe)

I wanted to gamify the process of deleting old photos from my camera roll. There's a lot of apps out there which already do this, but they have annoying freemium models or excessive features that I didn't want. So, I vibe coded a quick version for my personal use. Feel free to use this app however you want, just keep in mind that it is probably buggy.

### Features

Photos from your camera roll will be randomy selected. You can swipe on each photo to either keep it or delete it. Photos that are deleted are placed in the app's "Trash". You can recover a photo from the trash page by clicking on the photo. When you're ready to commit to deleting your photos, you can empty the trash. 

I purposely added lots of alerts before emptying the trash to ensure users (me) did not accidentally delete photos. As another layer of protection, you can still recover your images from your phone's recently deleted.

### Disclaimers

This app has only been tested on my phone (Apple iPhone IOS 18.6.2), so it is likely that it does not work on other phones. It is designed only for photos from your phones camera roll. I run it on expo go because I didn't want to pay Apple's insane $99/year developer fee. 

I wrote this app primarily using Cursor with `claude-sonnet-4`. The code is functional, it is not great.

This app was designed to fit my needs. Feel free to fork it to make it fit yours.

I'm not responsible for any data loss or other negative consequences of using this app.

## How to Use

#### Live

I deployed a preview of the app using expo app services. If you already have the [Expo Go](https://expo.dev/go) app, you can scan the QR code below with your phone. Since this is an app preview, it may go offline. However, I will do my best to keep it updated.

![App preview QR code](AppPreviewQRCode.png)

#### Local

1. Download the [Expo Go](https://expo.dev/go) app on your phone

2. Clone this repository

3. Run `npm run start` in the repo's root

4. Scan the QR code from the above commands output using your phone
