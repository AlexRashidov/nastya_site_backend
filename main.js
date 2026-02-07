const express = require("express");
const cors = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

// ===== Environment variables =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ BOT_TOKEN или CHAT_ID не заданы!");
    process.exit(1);
}

// ===== Telegram =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== App =====
const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

// ===== PostgreSQL =====
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // важно для Render
    },
});

// ===== Init DB =====
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                text TEXT NOT NULL,
                rating INTEGER NOT NULL,
                approved BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ PostgreSQL connected, table ready");
    } catch (err) {
        console.error("❌ DB init error:", err);
    }
})();

// ===== Routes =====

// ---- Form ----
app.post("/form", async (req, res) => {
    try {
        const { name, phone, message } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ error: "Имя и телефон обязательны" });
        }

        const telegramMessage = `📩 *Новая заявка с сайта*
👤 Имя: ${name}
📞 Телефон: ${phone}
💬 Сообщение: ${message || "Нет"}`;

        await bot.sendMessage(CHAT_ID, telegramMessage, { parse_mode: "Markdown" });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Не удалось отправить заявку" });
    }
});

// ---- Create review ----
app.post("/reviews", async (req, res) => {
    const { name, text, rating } = req.body;
    if (!name || !text || !rating) {
        return res.status(400).json({ error: "Заполните все поля" });
    }

    try {
        const result = await pool.query(
            `INSERT INTO reviews (name, text, rating, approved)
             VALUES ($1, $2, $3, FALSE)
             RETURNING id`,
            [name, text, rating]
        );

        const reviewId = result.rows[0].id;

        const message = `📝 *Новый отзыв*
👤 ${name}
⭐ ${rating}
💬 ${text}`;

        await bot.sendMessage(CHAT_ID, message, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [[
                    { text: "✅ Одобрить", callback_data: `approve_${reviewId}` },
                    { text: "❌ Отклонить", callback_data: `reject_${reviewId}` }
                ]]
            }
        });

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "DB error" });
    }
});

// ---- Get approved reviews ----
app.get("/reviews", async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM reviews
             WHERE approved = TRUE
             ORDER BY created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "DB error" });
    }
});

// ===== Telegram callbacks =====
bot.on("callback_query", async (query) => {
    const [action, id] = query.data.split("_");
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
        if (action === "approve") {
            await pool.query(
                "UPDATE reviews SET approved = TRUE WHERE id = $1",
                [id]
            );
            await bot.editMessageText("✅ Отзыв одобрен", {
                chat_id: chatId,
                message_id: messageId,
            });
        }

        if (action === "reject") {
            await pool.query(
                "DELETE FROM reviews WHERE id = $1",
                [id]
            );
            await bot.editMessageText("❌ Отзыв отклонён", {
                chat_id: chatId,
                message_id: messageId,
            });
        }

        await bot.answerCallbackQuery(query.id);
    } catch (err) {
        console.error("Callback error:", err);
    }
});

// ---- Seed reviews ----
app.post("/seed-reviews", async (req, res) => {
    const reviews = req.body;

    if (!Array.isArray(reviews) || reviews.length === 0) {
        return res.status(400).json({ error: "Неверный формат данных" });
    }

    try {
        for (const r of reviews) {
            await pool.query(
                `INSERT INTO reviews (name, text, rating, approved)
                 VALUES ($1, $2, $3, $4)`,
                [r.name, r.text, r.rating, r.approved || false]
            );
        }

        res.json({ success: true, inserted: reviews.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "DB error" });
    }
});

// ===== Start server =====
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
