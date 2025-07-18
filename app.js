const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

// Load environment variables
dotenv.config();

// Connect to database
require('./config/db');

const app = express();

// Body parser middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Method override for PUT and DELETE requests
app.use(methodOverride('_method'));

// Set static folder
app.use(express.static(path.join(__dirname, 'public')));

// EJS Layouts middleware
app.use(expressLayouts);
app.set('layout', 'layout');

// EJS template engine
app.set('view engine', 'ejs');

// Express session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: true,
  saveUninitialized: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds
  }
}));

// Connect flash for flash messages
app.use(flash());

// Helper function for Nepali currency formatting
function formatNepaliCurrency(num) {
  if (typeof num !== 'number') {
    return String(num); // Return as string if not a number
  }

  let numStr = String(num);
  // If the number has a fractional part, format it to 2 decimal places.
  // Otherwise, use it as is (to avoid adding .00 to integers).
  if (num % 1 !== 0) {
    numStr = num.toFixed(2);
  }

  const [integerPart, decimalPart] = numStr.split('.');

  const lastThree = integerPart.slice(-3);
  const otherNumbers = integerPart.slice(0, -3);
  let formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  if (otherNumbers) {
    formattedInteger += ',';
  }
  formattedInteger += lastThree;

  // Only add decimal part if it exists and is not "00"
  if (decimalPart && decimalPart !== "00") {
    return `${formattedInteger}.${decimalPart}`;
  } else {
    return formattedInteger;
  }
}

// Global variables for flash messages and helper functions
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.formatNepaliCurrency = formatNepaliCurrency;
  next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/users', require('./routes/auth'));
app.use('/transactions', require('./routes/transactions'));
app.use('/budgets', require('./routes/budgets'));

// Start the recurring transaction scheduler
const recurringTransactionService = require('./services/recurringTransactionService');
recurringTransactionService.start();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
