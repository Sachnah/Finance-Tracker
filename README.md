## 📦 A. Node.js

**Why?**  
Runs JavaScript outside the browser and powers your server-side code.

### 🔑 What to Learn:

- Setting up Node.js environment
- npm (Node Package Manager) basics

### 📚 Resources:

- [Node.js Official Docs](https://nodejs.org/en/docs/)
- [Node.js Crash Course (YouTube)](https://www.youtube.com/results?search_query=node.js+crash+course)

---

## ⚙️ B. Express.js

**Why?**  
Framework for building web servers and APIs.

### 🔑 What to Learn:

- Creating a server
- Routing (GET, POST, etc.)
- Middleware (body-parser, authentication)
- Serving static files

### 📚 Resources:

- [Express.js Guide](https://expressjs.com/)

---

## 🖼️ 4. Learn Templating with EJS

**Why?**  
Dynamically generates HTML pages on the server.

### 🔑 What to Learn:

- EJS syntax: `<%= %>`, `<% %>`, loops, conditionals
- Passing data from Express routes to EJS views

### 📚 Resources:

- [EJS Official Docs](https://ejs.co)

---

## 🗄️ 5. Learn Database Basics (MongoDB)

**Why?**  
To store transactions, budgets, and user data.

### 🔑 What to Learn:

- What is a database? What is NoSQL?
- MongoDB basics: documents, collections, CRUD operations
- Mongoose (ODM for MongoDB): schemas, models, validation

### 📚 Resources:

- [MongoDB University (Free Courses)](https://university.mongodb.com)
- [Mongoose Docs](https://mongoosejs.com)

---

## 🔐 6. Understand Authentication & Security

**Why?**  
To protect user data and restrict access.

### 🔑 What to Learn:

- User registration & login
- Password hashing (`bcrypt`)
- Sessions/cookies or JWTs

### 📚 Resources:

- [Passport.js Docs](http://www.passportjs.org/)
- [Authentication Crash Course (YouTube)](https://www.youtube.com/results?search_query=authentication+crash+course+nodejs)

---

## 🏗️ 7. Project Creation: Step-by-Step

### A. Set Up Your Project

- `npm init`
- Install dependencies: `express`, `ejs`, `mongoose`, `bcrypt`, `express-session`, etc.

### B. Build the Core Features

#### 🔑 User Authentication:

- Registration, login, logout

#### 📊 Dashboard:

- Show summary cards (income, expense, balance)
- List recent transactions

#### 💸 Transactions:

- Add, edit, delete transactions (income/expense)

#### 💰 Budgets:

- Set monthly budgets per category
- Track progress and projections

#### 🌐 Views:

- Use EJS to render pages and display dynamic data

### C. Add Enhancements

- Budget tips and projections (like your existing app)
- Responsive design for mobile
- Export data (CSV, PDF)

### D. Test Your App

- Manual testing (try all features)
- Optional: Write automated tests (Jest, Mocha)

### E. Deployment

- Deploy on platforms like **Heroku**, **Render**, or **Vercel**

---

## 🧠 8. Recommended Learning Sequence

1. JavaScript Fundamentals
2. HTML & CSS
3. Node.js & Express
4. EJS Templating
5. MongoDB & Mongoose
6. Authentication
7. Project Structure & Implementation

---

## 🛂 What is Passport.js?

**Passport.js** is a **middleware** for Node.js that helps you easily add authentication to your app.

It's flexible and supports many ways to authenticate:

- Username + Password (local strategy)
- OAuth (Google, GitHub, Facebook, etc.)
- JWT (JSON Web Token)
- Sessions

For your use case, you're probably using the **Local Strategy** (with sessions).

---

## 💡 What Is Authentication?

Authentication is how your app **verifies a user’s identity**.

In basic terms:

1. A user logs in with email & password.
2. The app checks: “Does this match a registered user?”
3. If yes, it lets them in—and remembers who they are on future requests.

---

## 🔐 Where Does the **Secret Key** Come In?

When you're using **sessions** (like with `express-session`), your app stores user info **in a cookie** on the user's browser.

The **secret key** is used to:

1. **Sign the session ID** (like a stamp of authenticity).
2. Prevent people from **tampering with cookies**.

Without this, someone could fake being logged in by crafting their own session cookie.

### Example:

```js
app.use(
  session({
    secret: "your-secret-key", // this signs the session cookie
    resave: false,
    saveUninitialized: false,
  })
);
```

Even if users see the cookie in their browser, they **can’t fake it**—because they don’t know the secret.

---

## 🧬 How Does Passport.js Work (Step by Step)?

1. **User logs in** with username/password.
2. Passport's **Local Strategy** checks credentials:
   - Finds user by email
   - Compares password using `bcrypt.compare`
3. If matched:
   - It **calls `done(null, user)`** to say login succeeded.
   - The user info is saved into a **session cookie**.
4. Now on every request:
   - Passport reads the cookie.
   - Retrieves the user from session.
   - Attaches user to `req.user`.

---

## 📌 Key Passport Concepts:

### `passport.serializeUser(user, done)`

- Decides what to store in session.
- Usually stores just `user.id` to keep it small.

### `passport.deserializeUser(id, done)`

- Gets called on each request.
- Finds full user from database using the stored ID.

---

## ⚙️ What You Need to Set It Up:

1. Set up `express-session` (with secret key)
2. Configure `passport` and `passport-local`
3. Define the login strategy
4. Handle login, logout routes
5. Protect routes with `isAuthenticated` middleware

---

## 👀 Simple Mental Model

Think of the **secret key** like the lock and key for a safe:

- You store session info (user ID) in a cookie.
- The secret key signs it to make sure no one can open or forge it.

---
