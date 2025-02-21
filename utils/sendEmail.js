const nodemailer = require('nodemailer');
const path = require('path');

// Email sending utility function
exports.sendMail = async ({ from, to, subject, html, attachFile }) => {
  try {
    // Create transporter using environment variables
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST, 
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS,  
      },
    });

    // Prepare email options
    const mailOptions = {
      from: from ?? process.env.EMAIL_DEFAULT_FROM, // Default sender from .env if not provided
      to,
      subject,
      html,
      // Handle attachments (if any)
      attachments: attachFile ? [{ filename: path.basename(attachFile), path: attachFile }] : [],
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);

    // Return the response from the mailer
    return info.response;
  } catch (error) {
    throw new Error(`Error sending email: ${error.message}`);
  }
};
