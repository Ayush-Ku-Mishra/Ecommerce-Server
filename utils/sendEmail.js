// utils/sendEmail.js
import nodeMailer from "nodemailer";

export const sendEmail = async (options) => {
  try {
    // Fix: createTransporter -> createTransport
    const transporter = nodeMailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_MAIL,
        pass: process.env.SMTP_PASSWORD
      }
    });

    const mailOptions = {
      from: `"Pickora" <${process.env.SMTP_MAIL}>`,
      to: options.email,
      subject: options.subject,
      html: options.message
    };

    console.log('Attempting to send email to:', options.email);
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;

  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};