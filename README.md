# Project Overview

   The Finance Tracker is a full-stack web application built with the following technologies:

   Backend: Node.js with Express.js
   Database: MongoDB with Mongoose ODM
   Frontend: EJS templates with Bootstrap and custom CSS
   Authentication: Session-based authentication using express-session
   Advanced Feature: Budget Pacing Algorithm for budget recommendations











# Implementation Steps
1. Project Setup
   Initialize Node.js project with npm
   Install dependencies
   Set up Express server
   Configure MongoDB connection

2. User Authentication
   Create User model
   Implement registration and login routes
   Set up session management
   Create authentication middleware

3. Transaction Management
   Create Transaction model
   Implement CRUD operations
   Build transaction listing and filtering
   Add CSV export functionality

4. Budget Management
      Create Budget model
      Implement budget CRUD operations
      Build budget visualization
      Implement basic budget alerts

5. Dashboard
   Create dashboard route
   Implement financial summary calculations
   Build recent transactions view
   Add budget status visualization

6. Frontend Styling
   Implement responsive layout
   Style forms and tables
   Add interactive elements
   Implement data visualization









7. Budget pacing algorithm

# Budget Pace Calculation (Lines 30-58)
   This is the core mathematical calculation that determines how a user is tracking against their budget:
   This function:

   Calculates how much should ideally be spent by the current day
   Determines the pace percentage (over 100% means spending too fast)
   Projects total spending by month end based on current rate
   Calculates remaining budget and daily budget for the rest of the month

# 2. Recommendation Generation (Lines 64-127)
   The getPaceRecommendation function uses the pace data to generate personalized recommendations:
   This function creates four types of recommendations based on spending pace:

   Warning (red): When spending pace is over 100% of ideal
   Caution (yellow): When spending pace is between 90-100% of ideal
   Positive (green): When spending pace is under 70% of ideal
   Info (blue): When spending pace is between 71-89% of ideal



# 3. Main Recommendation Generation Process (Lines 298-430)
   The generateRecommendations function ties everything together:
   This function:

   Gets all budgets for the current month
   For each budget, calculates total spending in that category
   Calculates budget pacing metrics using calculateBudgetPace
   Generates personalized recommendations using getPaceRecommendation
   Adds an overall budget recommendation based on total spending vs. total budget

# 4. Real-time Updates (Lines 129-145)
Updates recommendations in real-time when:
   New transactions are added
   Transactions are modified or deleted
   Budgets are created or updated


# What It Does & Its Importance in This Project:

# Provides Real-time Financial Awareness: 
Instead of just seeing how much you've spent, the pacing algorithm tells you how you're doing in relation to your budget goals and the passage of time. This is crucial for proactive financial management.

# Early Warning System: 
It can flag potential overspending early in the month, giving you time to adjust your spending habits before you actually exceed your budget.

# Actionable Insights: 
The recommendations generated (e.g., "cut back entirely," "you'll exceed your limit in X days") are more actionable than just raw numbers. They guide the user on what to do.

# Reduces Financial Stress: 
By providing a clear picture of budget health, it can reduce the anxiety of not knowing if you're on track.

# Encourages Better Spending Habits: 
Regular feedback on spending pace can help users develop a better intuition for their financial flow and make more conscious spending decisions.

# Personalized Advice: 
While the core algorithm is deterministic, the inputs (your specific budgets and transactions) make the output (the pace and recommendations) personalized to your financial situation.

In essence, the budget pacing algorithm transforms your finance tracker from a simple record-keeping tool into a more intelligent financial assistant that actively helps you stay on budget.















# Directory Structure and File Purposes

1. Root Directory Files
app.js: The main application entry point that sets up Express, middleware, session management, and routes
package.json: Defines project dependencies and scripts
.env: Contains environment variables like MongoDB connection string and session secret

2. Config Directory
db.js: Handles MongoDB connection setup using Mongoose

3. Middleware Directory
auth.js: Contains authentication middleware to protect routes that require login

4. Models Directory
User.js: Schema for user data with fields for name, email, password (hashed), and registration date
Transaction.js: Schema for financial transactions with fields for user reference, amount, type (income/expense), category, description, and date
Budget.js: Schema for budget data with fields for user reference, category, amount, month, and year
BudgetRL.js: Schema for the reinforcement learning model that stores Q-values and recommendation history[not needed since we use budget pacing algorithm]

5. Routes Directory
auth.js: Handles user registration, login, logout, and profile routes
index.js: Manages the landing page and dashboard routes
transactions.js: Handles CRUD operations for transactions and CSV export
budgets.js: Manages budget creation, updating, and deletion

6. Services Directory
budgetRLService.js: Implements the reinforcement learning algorithm for personalized budget recommendations

7. Views Directory
layout.ejs: The main template that includes the sidebar navigation and common elements
index.ejs: Landing page for non-authenticated users
dashboard.ejs: Main user dashboard showing financial overview
transactions.ejs: Page for viewing and managing transactions
budgets.ejs: Page for setting and tracking budgets
login.ejs & register.ejs: Authentication forms
profile.ejs: User profile page
edit-transaction.ejs: Form for editing transactions
partials/: Contains reusable EJS components

8. Public Directory
Contains static assets like CSS, JavaScript, and images




















# Application Flow

1. Authentication Flow
   User registers with name, email, and password
   Password is hashed using bcrypt before storage
   User logs in with email and password
   Session is created and stored in memory
   Authentication middleware checks for session on protected routes

2. Transaction Management
   User adds a transaction (income or expense)
   Transaction is stored in MongoDB
   Transactions are displayed in a table with filtering options
   User can edit or delete transactions
   Transactions can be exported as CSV

3. Budget Management
   User creates budgets for different categories
   System tracks spending against budgets
   Visual indicators show budget usage
   Budget recommendations adapt based on user behavior 

4. Dashboard Visualization
   Overview of income, expenses, and balance
   Recent transactions list
   Budget status with progress bars
   Visual indicators for financial health