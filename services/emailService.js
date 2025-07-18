const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendBudgetAlertEmail = async (userEmail, userName, category, percentageSpent) => {
  const mailOptions = {
    from: `"Finance Tracker" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: `Budget Alert: High Spending in ${category}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Hi ${userName},</h2>
        <p>This is an alert to let you know that you have spent <strong>${percentageSpent}%</strong> of your budget for the <strong>${category}</strong> category this month.</p>
        <p>You might want to review your recent transactions to stay on track.</p>
        <p>Best regards,<br>Bibek, Sachana, U</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Budget alert email sent successfully to:', userEmail);
  } catch (error) {
    console.error('Error sending budget alert email:', error);
  }
};

const sendVerificationEmail = async (userEmail, userName, verificationToken) => {
  const verificationUrl = `http://localhost:3000/users/verifyemail/${verificationToken}`;

  const mailOptions = {
    from: `"Finance Tracker" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: 'Welcome! Please Verify Your Email Address',
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
    console.log('Verification email sent successfully to:', userEmail);
  } catch (error) {
    console.error('Error sending verification email:', error);
  }
};

module.exports = {
  sendBudgetAlertEmail,
  sendVerificationEmail,
};
