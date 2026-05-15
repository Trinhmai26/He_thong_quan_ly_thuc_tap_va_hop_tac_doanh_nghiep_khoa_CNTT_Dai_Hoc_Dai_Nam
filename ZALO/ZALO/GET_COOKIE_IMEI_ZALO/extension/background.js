// background.js

// Function to create notifications
function createNotification(title, message) {
    const options = {
        type: 'basic',
        title: title,
        message: message,
        iconUrl: '/images/success.png'
    };
    chrome.notifications.create(options);
}

// Function to capture web requests
function captureRequests() {
    chrome.webRequest.onBeforeRequest.addListener(
        function(details) {
            const url = details.url;
            let imeiValue = 'Not Found';

            // Check if IMEI parameter is present in the URL
            if (url.includes('/api/login/getServerInfo') && url.includes('imei=')) {
                const params = new URLSearchParams(new URL(url).search);
                imeiValue = params.get('imei');
                chrome.runtime.sendMessage({ action: 'IMEIValue', imei: imeiValue });
                createNotification('IMEI Found', 'Successfully retrieved IMEI: ' + imeiValue);
            }

            // If IMEI is found and URL is chat.zalo.me, get cookies
            if (imeiValue !== 'Not Found' && url.includes('chat.zalo.me')) {
                chrome.cookies.getAll({ url: url }, function(cookies) {
                    const cookiesDict = {};

                    cookies.forEach(cookie => {
                        cookiesDict[cookie.name] = cookie.value;
                    });

                    chrome.runtime.sendMessage({ action: 'CookiesValue', cookies: JSON.stringify(cookiesDict) });
                    createNotification('Cookies Found', 'Successfully retrieved cookies.');
                });
            }
        },
        { urls: ["<all_urls>"] },
        ["requestBody"]
    );
}

// Start capturing requests
captureRequests();
