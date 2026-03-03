import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Maya Scott",
  description: "Privacy Policy for Maya Scott",
};

export default function PrivacyPage() {
  return (
    <div className="container max-w-3xl mx-auto py-16 px-4">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      
      <div className="prose prose-lg">
        <p className="mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">1. Introduction</h2>
        <p>
          At Maya Scott, we respect your privacy and are committed to protecting your personal data.
          This Privacy Policy will inform you about how we look after your personal data when you visit our website
          and tell you about your privacy rights and how the law protects you.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">2. Data We Collect</h2>
        <p>
          We may collect, use, store, and transfer different kinds of personal data about you which we have grouped together as follows:
        </p>
        <ul className="list-disc pl-6 mb-4">
          <li>Identity Data: includes first name, last name, username</li>
          <li>Contact Data: includes email address</li>
          <li>Technical Data: includes internet protocol (IP) address, browser type and version, time zone setting, browser plug-in types and versions</li>
          <li>Usage Data: includes information about how you use our website and services</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">3. How We Use Your Data</h2>
        <p>
          We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:
        </p>
        <ul className="list-disc pl-6 mb-4">
          <li>To provide and improve our services</li>
          <li>To personalize your experience</li>
          <li>To communicate with you</li>
          <li>To comply with legal obligations</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">4. Data Security</h2>
        <p>
          We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used, 
          or accessed in an unauthorized way, altered, or disclosed.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">5. Your Legal Rights</h2>
        <p>
          Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to:
        </p>
        <ul className="list-disc pl-6 mb-4">
          <li>Request access to your personal data</li>
          <li>Request correction of your personal data</li>
          <li>Request erasure of your personal data</li>
          <li>Object to processing of your personal data</li>
          <li>Request restriction of processing your personal data</li>
          <li>Request transfer of your personal data</li>
          <li>Right to withdraw consent</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">6. Cookies</h2>
        <p>
          We use cookies to enhance your experience on our website. You can set your browser to refuse all or some browser cookies, 
          or to alert you when websites set or access cookies.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">7. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">8. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please contact us at privacy@mayascott.ai.
        </p>
      </div>
    </div>
  );
} 