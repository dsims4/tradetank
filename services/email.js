/** Connects to the email provider and sends automatic account emails. */
const nodemailer = require("nodemailer");

let transporter;
let senderAddress;

/*
 * This function reads the private email settings from environment variables.
 *
 * SMTP is the standard system used to send email. TLS encrypts the connection.
 * Port 465 starts encrypted immediately. Port 587 connects first and then uses
 * STARTTLS to turn encryption on before login information is sent.
 *
 * Returns the settings object Nodemailer needs to connect and log in.
 * Throws an error when a required setting or valid port number is missing.
 */
function getSMTPConfiguration() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    const port = Number.parseInt(process.env.SMTP_PORT || "465", 10);

    if (
        !host ||
        !user ||
        !password ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
    ) {
        throw new Error("The SMTP configuration is incomplete.");
    }

    return {
        host,
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: {
            user,
            pass: password
        }
    };
}

/*
 * This function creates the reusable Nodemailer sender the first time it is
 * needed.
 *
 * Waiting until an email must be sent lets unrelated scripts, such as database
 * checks, run without requiring email settings.
 *
 * Returns the same configured email sender every time after the first call.
 */
function getTransporter() {
    if (!transporter) {
        const configuration = getSMTPConfiguration();
        transporter = nodemailer.createTransport(configuration);
        senderAddress = process.env.SMTP_FROM || configuration.auth.user;
    }

    return transporter;
}

/*
 * This function adds Trade Tank's sender name and sends one email.
 *
 * The supplied message provides the recipient, subject, plain-text body, and
 * optional HTML body.
 *
 * Returns a Promise whose value contains the email provider's delivery result.
 * The Promise fails when the provider does not accept the email.
 */
async function sendEmail(message) {
    const mailTransporter = getTransporter();

    return mailTransporter.sendMail({
        from: `Trade Tank <${senderAddress}>`,
        ...message
    });
}

/*
 * This function emails a password-reset link that can be used only once.
 * It includes both plain text and HTML so different email apps can display it.
 *
 * Returns a Promise that finishes after the email provider accepts the message.
 */
async function sendResetPasswordEmail(email, resetPasswordURL) {
    await sendEmail({
        to: email,
        subject: "Reset your Trade Tank password",
        text: [
            "A password reset was requested for your Trade Tank account.",
            "",
            `Reset your password: ${resetPasswordURL}`,
            "",
            "This link expires in 15 minutes.",
            "If you did not request this reset, you can ignore this email."
        ].join("\n"),
        html: [
            "<p>A password reset was requested for your Trade Tank account.</p>",
            `<p><a href="${resetPasswordURL}">Reset your password</a></p>`,
            "<p>This link expires in 15 minutes.</p>",
            "<p>If you did not request this reset, you can ignore this email.</p>"
        ].join("")
    });
}

/*
 * This function sends two notices after an account's email address changes.
 *
 * The old address receives a warning in case the owner did not make the change.
 * The new address receives confirmation that it is now connected to the account.
 *
 * Returns a Promise that finishes after both emails are accepted.
 * It fails if either email cannot be sent.
 */
async function sendEmailChangeNotifications(oldEmail, newEmail) {
    await Promise.all([
        sendEmail({
            to: newEmail,
            subject: "Your Trade Tank email address was changed",
            text: [
                "Your Trade Tank email address was changed successfully.",
                "",
                "No further action is required."
            ].join("\n"),
            html: [
                "<p>Your Trade Tank email address was changed successfully.</p>",
                "<p>No further action is required.</p>"
            ].join("")
        }),
        sendEmail({
            to: oldEmail,
            subject: "Your Trade Tank email address was changed",
            text: [
                "The email address for your Trade Tank account was changed.",
                "",
                "If you did not make this change, contact " +
                    "contact@tradetank.dev immediately."
            ].join("\n"),
            html: [
                "<p>The email address for your Trade Tank account was changed.</p>",
                "<p>If you did not make this change, contact " +
                    "contact@tradetank.dev immediately.</p>"
            ].join("")
        })
    ]);
}

/*
 * This function tells the account owner that their password was changed.
 *
 * Returns a Promise that finishes after the email provider accepts the message.
 */
async function sendPasswordChangedEmail(email) {
    await sendEmail({
        to: email,
        subject: "Your Trade Tank password was changed",
        text: [
            "The password for your Trade Tank account was changed.",
            "",
            "If you did not make this change, contact " +
                "contact@tradetank.dev immediately."
        ].join("\n"),
        html: [
            "<p>The password for your Trade Tank account was changed.</p>",
            "<p>If you did not make this change, contact " +
                "contact@tradetank.dev immediately.</p>"
        ].join("")
    });
}

module.exports = {
    sendEmailChangeNotifications,
    sendPasswordChangedEmail,
    sendResetPasswordEmail
};
