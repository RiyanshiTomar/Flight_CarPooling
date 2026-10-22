import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of use" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="October 2026">
      <h2>1. What FlyPool is</h2>
      <p>
        FlyPool is a matching service. We help travellers who land at the same airport at about the same time find each other so they
        can share one cab. We do not operate, book or dispatch cabs, we are not a transport provider, and we do not collect or hold
        fares.
      </p>
      <h2>2. Your account</h2>
      <ul>
        <li>You must be 18 or older and use your own mobile number.</li>
        <li>Give your real first name and keep your profile accurate.</li>
        <li>Keep your login codes private. Never share an OTP with anyone, including people in your group.</li>
      </ul>
      <h2>3. Sharing a ride</h2>
      <ul>
        <li>Fare amounts in FlyPool are rough estimates. The real fare is set by the cab you book.</li>
        <li>How you split and pay the fare is agreed between the people in your group.</li>
        <li>Check the cab&apos;s plate and driver before getting in. Use the SOS and share-trip tools if you feel unsafe.</li>
      </ul>
      <h2>4. Behaviour</h2>
      <p>
        Be respectful. Harassment, discrimination, no-shows without notice, or misuse of the women-only option can lead to suspension.
        Report problems from the group page.
      </p>
      <h2>5. Liability</h2>
      <p>
        FlyPool is not responsible for the cab service, its driver, or the conduct of other travellers, to the extent allowed by law.
      </p>
      <h2>6. Ending your account</h2>
      <p>You can delete your account at any time from your profile.</p>
    </LegalPage>
  );
}
