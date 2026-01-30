export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last updated: January 2025</p>

        <div className="prose prose-gray max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Information We Collect</h2>
            <p className="text-gray-600 mb-4">When you use our Instagram DM automation service, we collect:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Instagram Business account information (username, account ID)</li>
              <li>Facebook Page information necessary for API access</li>
              <li>Message content for automation and response purposes</li>
              <li>Contact information (emails, phone numbers) provided by Instagram users through conversations</li>
              <li>Usage analytics to improve our service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. How We Use Your Information</h2>
            <p className="text-gray-600 mb-4">We use the collected information to:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Provide automated DM responses based on your configured automations</li>
              <li>Display conversation history and analytics in your dashboard</li>
              <li>Collect and store leads on your behalf</li>
              <li>Improve and optimize our service</li>
              <li>Send you important service updates</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Data Storage & Security</h2>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>All data is stored securely on Google Cloud Platform (Firebase)</li>
              <li>Access tokens are encrypted at rest using industry-standard encryption</li>
              <li>We use HTTPS for all data transmission</li>
              <li>Access to data is restricted to authorized personnel only</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Data Sharing</h2>
            <p className="text-gray-600 mb-4">We do not sell your data. We share data only with:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li><strong>Meta (Facebook/Instagram)</strong> - Required for API functionality</li>
              <li><strong>Google Cloud Platform</strong> - For hosting and data storage</li>
              <li><strong>Anthropic (Claude AI)</strong> - For AI-powered response generation (message content only, no personal identifiers)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Your Rights</h2>
            <p className="text-gray-600 mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Access your data through your dashboard</li>
              <li>Export your data (leads, conversations)</li>
              <li>Delete your account and all associated data</li>
              <li>Disconnect your Instagram account at any time</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Data Retention</h2>
            <p className="text-gray-600">
              We retain your data for as long as your account is active. When you delete your account,
              all associated data is permanently deleted within 30 days. Conversation logs may be
              retained for up to 90 days for service improvement purposes, after which they are anonymized.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Cookies</h2>
            <p className="text-gray-600">
              We use essential cookies for authentication and session management. We do not use
              tracking cookies or share cookie data with third parties.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Changes to This Policy</h2>
            <p className="text-gray-600">
              We may update this privacy policy from time to time. We will notify you of any changes
              by posting the new policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Contact Us</h2>
            <p className="text-gray-600">
              If you have any questions about this Privacy Policy, please contact us at:
              <br />
              <a href="mailto:privacy@yourdomain.com" className="text-instagram-pink hover:underline">
                privacy@yourdomain.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <a href="/login" className="text-instagram-pink hover:underline">
            ← Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}
