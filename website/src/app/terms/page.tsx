import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Maya Scott",
  description: "Terms of Service for Maya Scott",
};

export default function TermsPage() {
  return (
    <div className="container max-w-3xl mx-auto py-16 px-4">
      <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
      
      <div className="prose prose-lg">
        <p className="mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">1. Introduction</h2>
        <p>
          Welcome to Maya Scott. These Terms of Service govern your use of our website and services. 
          By accessing or using our services, you agree to be bound by these Terms.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">2. Using Our Services</h2>
        <p>
          You must follow any policies made available to you within the Services. You may use our Services only as 
          permitted by law. We may suspend or stop providing our Services to you if you do not comply with our terms or 
          policies or if we are investigating suspected misconduct.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">3. Your Account</h2>
        <p>
          You may need an account to use some of our Services. You are responsible for maintaining the security of your 
          account and password. We cannot and will not be liable for any loss or damage from your failure to comply with 
          this security obligation.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">4. Privacy & Copyright Protection</h2>
        <p>
          Our privacy policies explain how we treat your personal data and protect your privacy when you use our Services. 
          By using our Services, you agree that we can use such data in accordance with our privacy policies.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">5. Changes to the Terms</h2>
        <p>
          We may modify these terms or any additional terms that apply to a Service to, for example, reflect changes to 
          the law or changes to our Services.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4">6. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at support@mayascott.ai.
        </p>
      </div>
    </div>
  );
} 