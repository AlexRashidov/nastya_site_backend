const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const TelegramBot = require("node-telegram-bot-api");

// ===== Environment variables =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ BOT_TOKEN или CHAT_ID не заданы!");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

// ===== Middleware =====
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

// ===== Database =====
const db = new sqlite3.Database("./reviews.db", (err) => {
    if (err) return console.error("DB error:", err.message);
    console.log("✅ SQLite connected");
});

db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
                                           id INTEGER PRIMARY KEY AUTOINCREMENT,
                                           name TEXT,
                                           text TEXT,
                                           rating INTEGER,
                                           approved INTEGER DEFAULT 0,
                                           created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// ===== Routes =====
app.post("/form", async (req, res) => {
    try {
        const { name, phone, message } = req.body;
        if (!name || !phone) return res.status(400).json({ error: "Имя и телефон обязательны" });

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

app.post("/reviews", (req, res) => {
    const { name, text, rating } = req.body;
    if (!name || !text || !rating) return res.status(400).json({ error: "Заполните все поля" });

    db.run(
        `INSERT INTO reviews (name, text, rating, approved) VALUES (?, ?, ?, 0)`,
        [name, text, rating],
        function (err) {
            if (err) return res.status(500).json({ error: "DB error" });

            const reviewId = this.lastID;
            const message = `📝 *Новый отзыв*
👤 ${name}
⭐ ${rating}
💬 ${text}`;

            bot.sendMessage(CHAT_ID, message, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Одобрить", callback_data: `approve_${reviewId}` },
                            { text: "❌ Отклонить", callback_data: `reject_${reviewId}` }
                        ]
                    ]
                }
            });

            res.json({ success: true });
        }
    );
});

app.get("/reviews", (req, res) => {
    db.all(
        `SELECT * FROM reviews WHERE approved = 1 ORDER BY created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: "DB error" });
            res.json(rows);
        }
    );
});

// ===== Telegram callback =====
bot.on("callback_query", async (query) => {
    const [action, id] = query.data.split("_");
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (action === "approve") {
        db.run("UPDATE reviews SET approved = 1 WHERE id = ?", [id]);
        await bot.editMessageText("✅ Отзыв одобрен", { chat_id: chatId, message_id: messageId });
    }

    if (action === "reject") {
        db.run("DELETE FROM reviews WHERE id = ?", [id]);
        await bot.editMessageText("❌ Отзыв отклонён", { chat_id: chatId, message_id: messageId });
    }

    bot.answerCallbackQuery(query.id);
});
app.post("/seed-reviews", (req, res) => {
    const reviews = req.body; // ожидаем массив объектов {name, text, rating, approved}

    if (!Array.isArray(reviews) || reviews.length === 0) {
        return res.status(400).json({ error: "Неверный формат данных" });
    }

    const placeholders = reviews.map(() => "(?, ?, ?, ?)").join(",");
    const values = reviews.flatMap(r => [r.name, r.text, r.rating, r.approved || 0]);

    db.run(
        `INSERT INTO reviews (name, text, rating, approved) VALUES ${placeholders}`,
        values,
        function(err) {
            if (err) return res.status(500).json({ error: "DB error", details: err.message });
            res.json({ success: true, inserted: this.changes });
        }
    );
});
// ===== Start server =====
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
