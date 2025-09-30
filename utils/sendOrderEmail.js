import { sendEmail } from "../utils/sendEmail.js";

export const sendOrderConfirmationEmail = async (userEmail, orderData) => {
  try {
    const subject = `🎉 Your Pickora Order #${orderData.orderId} is Confirmed!`;

    const message = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Order Confirmation - Pickora</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9;">
        <div style="max-width: 650px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #6e48aa, #9d50bb); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">🛍️ Pickora</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Your Style, Delivered.</p>
          </div>

          <!-- Body -->
          <div style="padding: 30px 25px;">
            <h2 style="color: #333; font-size: 24px; margin-top: 0;">Hi ${orderData.delivery_address.name},</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              Thank you for shopping with <strong>Pickora</strong>! 🎉<br/>
              Your order has been successfully placed and is being prepared with care.
            </p>

            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #6e48aa;">
              <p style="margin: 5px 0; font-size: 15px;"><strong>📦 Order ID:</strong> <code>${orderData.orderId}</code></p>
              <p style="margin: 5px 0; font-size: 15px;"><strong>💰 Total Amount:</strong> ₹${orderData.TotalAmount}</p>
              <p style="margin: 5px 0; font-size: 15px;"><strong>💳 Payment Method:</strong> ${orderData.paymentMethod}</p>
              <p style="margin: 5px 0; font-size: 15px;"><strong>📍 Status:</strong> <span style="color: #4CAF50; font-weight: 600;">${orderData.status.toUpperCase()}</span></p>
            </div>

            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              <strong>🚚 We’ll notify you via in-app notification on Pickora as soon as your order ships!</strong><br/>
              You can also track your order anytime in your <a href="https://pickora.netlify.app/account/orders" style="color: #6e48aa; text-decoration: none; font-weight: 600;">Account → Orders</a>.
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://pickora.netlify.com/account/orders/${orderData.orderId}" 
                 style="display: inline-block; background: #6e48aa; color: white; padding: 12px 30px; border-radius: 25px; text-decoration: none; font-weight: 600; font-size: 16px;">
                 👉 Track Your Order
              </a>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />

            <h3 style="color: #333; font-size: 18px;">Need Help?</h3>
            <p style="font-size: 15px; color: #555; line-height: 1.6;">
              Visit our <a href="https://pickora.netlify.com" style="color: #6e48aa; font-weight: 600; text-decoration: none;">Help Center</a> or reply to this email — we’re here for you!
            </p>
          </div>

          <!-- Footer -->
          <div style="background: #fafafa; padding: 20px; text-align: center; border-top: 1px solid #eee; font-size: 13px; color: #888;">
            <p style="margin: 5px 0;">© 2025 Pickora. All rights reserved.</p>
            <p style="margin: 5px 0; font-size: 12px;">This is an automated message. Please do not reply directly.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      email: userEmail,
      subject,
      message,
    });

    console.log(`✅ Order confirmation email sent to ${userEmail} for order #${orderData.orderId}`);
  } catch (error) {
    console.error("❌ Failed to send order confirmation email:", error.message);
    throw error;
  }
};