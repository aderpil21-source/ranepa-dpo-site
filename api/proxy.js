export default async function handler(req, res) {
    // 1. Настройки CORS, чтобы ваш сайт на GitHub мог делать запросы к Vercel
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Разрешаем доступ отовсюду (или укажите 'https://ranepa-dpo39.ru')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Обработка предварительного запроса браузера (Preflight)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Принимаем только POST запросы
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 2. Достаем ключ из безопасного хранилища Vercel (его никто не увидит)
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key is missing in Vercel Environment Variables' });
    }

    try {
        // 3. Отправляем скрытый запрос к OpenRouter
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://ranepa-dpo39.ru'
            },
            body: JSON.stringify(req.body)
        });

        // 4. Возвращаем ответ нейросети обратно на ваш сайт
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch from OpenRouter' });
    }
}
