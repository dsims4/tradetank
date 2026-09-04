const nodemailer = require("nodemailer");

let transporter;
let senderAddress;

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

function getTransporter() {
    if (!transporter) {
        const configuration = getSMTPConfiguration();
        transporter = nodemailer.createTransport(configuration);
        senderAddress = process.env.SMTP_FROM || configuration.auth.user;
    }

    return transporter;
}

async function sendEmail(message) {
    const mailTransporter = getTransporter();

    return mailTransporter.sendMail({
        from: `Trade Tank <${senderAddress}>`,
        ...message
    });
}

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
