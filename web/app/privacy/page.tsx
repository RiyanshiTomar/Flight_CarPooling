import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="October 2026">
      <p>We collect as little as we can, and use it only to match you safely. This policy is written with India&apos;s Digital Personal Data Protection Act, 2023 in mind.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Mobile number (to log you in with an OTP).</li>
        <li>Name and gender (gender is used only for women-only groups and is never shown).</li>
        <li>Flight number, arrival date, drop area, seats and luggage for each ride.</li>
        <li>Group chat messages, ratings and safety reports.</li>
        <li>Your trusted contact and, only when you press SOS, your location.</li>
      </ul>
      <h2>What others see</h2>
      <ul>
        <li>Before you join a group: your first name, rating, rides count and drop area.</li>
        <li>Never: your phone number, exact address or gender.</li>
        <li>People you send a trip link to see your group&apos;s first names, pickup point and ride status until the link expires.</li>
      </ul>
      <h2>How long we keep it</h2>
      <p>Login codes are deleted within a day. Ride and chat data is kept for safety and dispute handling, then archived.</p>
      <h2>Your rights</h2>
      <ul>
        <li>See and correct your details on your profile.</li>
        <li>Delete your account from your profile. We erase your name, phone and contacts; anonymous ride records stay for safety.</li>
        <li>Questions or grievances: contact the grievance officer listed here before launch.</li>
      </ul>
    </LegalPage>
  );
}
