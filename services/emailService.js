const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendBudgetAlertEmail = async (
  userEmail,
  userName,
  category,
  spentAmount,
  budgetAmount
) => {
  const mailOptions = {
    from: `"Finance Tracker" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: `Budget Alert: High Spending in ${category}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Hi ${userName},</h2>
                <p>This is an alert to let you know that you have spent <strong>Rs ${spentAmount.toFixed(
                  2
                )}</strong> out of your <strong>Rs ${budgetAmount.toFixed(
      2
    )}</strong> budget for the <strong>${category}</strong> category this month.</p>
        <p>You might want to review your recent transactions to stay on track.</p>
        <p>Best regards,<br>Bibek, Sachana, Ushmita</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Budget alert email sent successfully to:", userEmail);
  } catch (error) {
    console.error("Error sending budget alert email:", error);
  }
};

const sendVerificationEmail = async (
  userEmail,
  userName,
  verificationToken
) => {
  const verificationUrl = `http://localhost:3000/users/verifyemail/${verificationToken}`;

  const mailOptions = {
    from: `"Finance Tracker" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: "Welcome! Please Verify Your Email Address",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Hi ${userName},</h2>
        <p>Thank you for registering with Finance Tracker. Please click the link below to verify your email address and complete your registration.</p>
        <p><a href="${verificationUrl}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
        <p>This link will expire in 10 minutes.</p>
        <p>If you did not create an account, please ignore this email.</p>
        <p>Best regards,<br>The Finance Tracker Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Verification email sent successfully to:", userEmail);
  } catch (error) {
    console.error("Error sending verification email:", error);
  }
};

const sendPasswordResetEmail = async (userEmail, userName, resetToken) => {
  const resetUrl = `http://localhost:3000/users/resetpassword/${resetToken}`;

  const mailOptions = {
    from: `"Finance Tracker" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: "Password Reset Request - Finance Tracker",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Hi ${userName},</h2>
        <p>You requested a password reset for your Finance Tracker account. Please click the link below to reset your password:</p>
        <p><a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>This link will expire in 10 minutes.</p>
        <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
        <p>Best regards,<br>The Finance Tracker Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Password reset email sent successfully to:", userEmail);
  } catch (error) {
    console.error("Error sending password reset email:", error);
  }
};

module.exports = {
  sendBudgetAlertEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
