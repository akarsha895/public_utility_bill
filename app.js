const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const fsPromises = require("fs").promises;
const pdf = require("pdfkit");
const path = require("path");

const app = express();
app.use(bodyParser.json());

class Queue {
  constructor() {
    this.queue = [];
  }

  enqueue(request) {
    if (request.isUrgent) {
      this.queue.unshift(request);
    } else {
      this.queue.push(request);
    }
  }

  dequeue() {
    return this.queue.shift();
  }

  viewQueue() {
    return this.queue;
  }
}

class Stack {
  constructor() {
    this.stack = [];
  }

  push(transaction) {
    this.stack.push(transaction);
  }

  pop() {
    return this.stack.pop();
  }

  viewHistory() {
    return this.stack;
  }
}

const paymentQueue = new Queue();
const transactionHistory = new Stack();

const invoicesDir = path.join(__dirname, "invoices");
fsPromises.mkdir(invoicesDir, { recursive: true }).catch((err) => {
  console.error("Error creating invoices directory:", err);
});

const logDailyTransaction = async (transaction) => {
  const logFile = "daily_transactions.json";
  const data = { ...transaction, timestamp: new Date() };

  try {
    let transactions = [];
    try {
      const content = await fsPromises.readFile(logFile, "utf8");
      transactions = content.trim() ? JSON.parse(content) : [];
    } catch (err) {
      console.error("Error reading the log file:", err);
    }

    transactions.push(data);

   
    await fsPromises.writeFile(logFile, JSON.stringify(transactions, null, 2));
  } catch (err) {
    console.error("Error writing to the log file:", err);
  }
};


const generateInvoice = (transaction) => {
  const doc = new pdf();
  const invoicePath = path.join(invoicesDir, `invoice_${transaction.userId}_${Date.now()}.pdf`);

  doc.pipe(fs.createWriteStream(invoicePath));
  doc.text(`Invoice for ${transaction.type} Bill Payment`, { align: "center" });
  doc.text(`User ID: ${transaction.userId}`);
  doc.text(`Amount: $${transaction.amount}`);
  doc.text(`Date: ${transaction.date}`);
  doc.text(`Due Date: ${transaction.dueDate}`);
  doc.text(`Urgent: ${transaction.isUrgent ? "Yes" : "No"}`);
  doc.end();

  return invoicePath;
};


app.post("/addPayment", (req, res) => {
  const { userId, type, amount, date, dueDate, isUrgent = false } = req.body;

  if (!userId || !type || !amount || !date || !dueDate) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const paymentRequest = { userId, type, amount, date, dueDate, isUrgent };
  paymentQueue.enqueue(paymentRequest);

  res.status(201).json({ message: "Payment request added successfully", paymentRequest });
});


app.post("/multipleRequest", (req, res) => {
  const payments = req.body.payments; 

  if (!payments || payments.length === 0) {
    return res.status(400).json({ error: "No payments to add" });
  }

  try {

    payments.forEach(payment => {
      paymentQueue.enqueue(payment);
    });

  
    res.json({
      message: "Added multiple payment requests to the queue",
      queue: paymentQueue.viewQueue(), 
    });
  } catch (error) {
    console.error("Error adding multiple payments to queue:", error);
    res.status(500).json({ error: "Failed to add multiple payments to the queue" });
  }
});


app.get("/viewQueue", (req, res) => {
  res.json({ queue: paymentQueue.viewQueue() });
});


app.post("/processPayment", async (req, res) => {
  const nextPayment = paymentQueue.dequeue();
  if (nextPayment) {
    const invoicePath = generateInvoice(nextPayment);
    transactionHistory.push(nextPayment);
    await logDailyTransaction(nextPayment);

    res.json({ message: "Processed payment", payment: nextPayment, invoicePath });
  } else {
    res.status(400).json({ message: "No payments in the queue" });
  }
});


app.get("/transactionHistory", (req, res) => {
  res.json({ history: transactionHistory.viewHistory() });
});

app.post("/undoLastTransaction", (req, res) => {
  const lastTransaction = transactionHistory.pop();
  if (lastTransaction) {
    res.json({ message: "Last transaction undone", transaction: lastTransaction });
  } else {
    res.status(400).json({ message: "No transactions to undo" });
  }
});

app.get("/viewDailyLog", async (req, res) => {
  try {
    const data = await fsPromises.readFile("daily_transactions.json", "utf8");
    let dailyLog = [];
    try {
      dailyLog = data.trim() ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Error parsing the log file:", e);
    }
    res.json({ dailyLog });
  } catch (err) {
    res.status(500).json({ error: "Could not retrieve log" });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
