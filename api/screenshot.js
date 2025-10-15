// api/screenshot.js - Minimal Puppeteer Screenshot API
import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    let browser = null;
    
    try {
        const { code, options = {} } = req.body;
        
        // Validate input
        if (!code || code.trim() === '') {
            return res.status(400).json({ message: 'HTML/CSS code is required' });
        }

        console.log('Starting screenshot generation...');
        
        // Launch browser
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        
        // Set viewport
        await page.setViewport({
            width: options.width || 1200,
            height: options.height || 800,
            deviceScaleFactor: options.scale || 2
        });

        console.log('Setting page content...');
        
        // Set content
        await page.setContent(code, {
            waitUntil: 'networkidle0',
            timeout: 20000
        });

        console.log('Taking screenshot...');
        
        // Take screenshot
        const screenshotBuffer = await page.screenshot({
            type: options.format || 'png',
            quality: options.format === 'jpeg' ? (options.quality || 90) : undefined,
            fullPage: options.fullPage !== false
        });

        console.log(`Screenshot generated: ${screenshotBuffer.length} bytes`);

        // Close browser
        await browser.close();
        browser = null;

        // Send response
        const contentType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', screenshotBuffer.length);
        res.setHeader('X-Generation-Time', `${Date.now()}ms`);
        
        return res.status(200).send(screenshotBuffer);

    } catch (error) {
        console.error('Screenshot error:', error);
        
        let message = 'Screenshot generation failed';
        if (error.name === 'TimeoutError') {
            message = 'Generation timed out. Try simpler HTML/CSS.';
        } else if (error.message.includes('Navigation')) {
            message = 'Invalid HTML content. Check your code syntax.';
        }
        
        return res.status(500).json({
            message: message,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
        
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e);
            }
        }
    }
}