//src/components/pages/contact/Contact.tsx
"use client";

import CornerFlourish from "@/components/shared/CornerFlourish";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Mail,
  MessageCircle,
  Linkedin,
  Instagram,
  Twitter,
  Copy,
  ExternalLink,
  AlertTriangle,
  Github,
} from "lucide-react";
import { useState } from "react";

const contactLinks = [
  {
    label: "Email",
    value: "protocolsfarmer@gmail.com",
    href: "mailto:protocolsfarmer@gmail.com",
    icon: Mail,
    description: "For serious inquiries, collaborations, or job offers.",
    isCopyable: true,
  },
  {
    label: "Discord",
    value: "protocols_farmer",
    href: "https://discord.com/users/protocols_farmer",
    icon: MessageCircle,
    description:
      "Fastest replies. DM me about projects, bugs, or just to chat.",
    isCopyable: true,
  },
  {
    label: "LinkedIn",
    value: "Hwapyong Maniragaba Edouard",
    href: "https://www.linkedin.com/in/hwapyong-maniragaba-edouard-415961344/",
    icon: Linkedin,
    description: "Professional profile. Connect if we've worked together.",
    isCopyable: false,
  },
  {
    label: "Instagram",
    value: "@protocols_farmer",
    href: "https://instagram.com/protocols_farmer",
    icon: Instagram,
    description:
      "Rare posts. Probably code screenshots and late-night thoughts.",
    isCopyable: false,
  },
  {
    label: "X (Twitter)",
    value: "@protocolsfarmer",
    href: "https://x.com/protocolsfarmer",
    icon: Twitter,
    description: "Tech takes, project updates, and complaining about bugs.",
    isCopyable: false,
  },
  {
    label: "GitHub",
    value: "protocols-farmer",
    href: "https://github.com/protocols-farmer",
    icon: Github,
    description: "Code repositories, contributions, and open source work.",
    isCopyable: false,
  },
];

export default function ContactPage() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  return (
    <section className="p-3 lg:p-6 min-h-screen border-3 border-double flex flex-col gap-6">
      {/* Header */}
      <div className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-top-1 -right-1 rotate-90" />
        <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <h1 className="bg-primary text-primary-foreground font-bold p-1 w-fit">
          Contact Me
        </h1>
        <div className="border-l-3 border-double pl-3">
          <p className="text-sm font-bold">
            No contact forms. No automated replies. Just reach out directly.
          </p>
        </div>
      </div>

      {/* Contact Channels */}
      <div className="grid grid-cols-1 gap-3">
        {contactLinks.map((link, index) => (
          <div
            key={link.label}
            className="relative border-3 border-double p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
          >
            <CornerFlourish className="-top-1 -left-1" />
            <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

            <div className="flex gap-3 items-start flex-1">
              {/* Icon */}
              <div className="border-3 border-double p-1 shrink-0">
                <link.icon className="h-5 w-5 text-primary" />
              </div>

              {/* Info */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <h3 className="font-bold text-primary text-sm">
                    {link.label} :
                  </h3>
                  <span className="text-xs font-bold border-3 border-double bg-card">
                    {link.value}
                  </span>
                </div>
                <p className="text-xs">{link.description}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 shrink-0">
              {link.isCopyable && (
                <Button
                  variant="outline"
                  className="border-3 border-double rounded-none text-xs gap-1"
                  onClick={() => handleCopy(link.value, index)}
                >
                  {copiedIndex === index ? (
                    <>
                      <span className="text-primary">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                className="border-3 border-double rounded-none h-8 text-xs gap-1"
              >
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  <span>Open</span>
                </a>
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Response Times */}
      <div className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-top-1 -right-1 rotate-90" />
        <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <div className="flex gap-1 items-center text-primary">
          <AlertTriangle className="h-4 w-4" />
          <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit text-sm">
            What to Expect
          </h4>
        </div>

        <div className="border-l-3 border-double pl-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-primary font-bold text-xs">Discord</span>
            <p className="text-xs">
              Usually same day. I practically live there.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-primary font-bold text-xs">Email</span>
            <p className="text-xs">24-48 hours. I check it twice daily.</p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-primary font-bold text-xs">Social Media</span>
            <p className="text-xs">
              Whenever I'm not coding. Don't expect instant replies.
            </p>
          </div>
        </div>
      </div>

      {/* Recruiter / Collaboration Note */}
      <div className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit text-sm">
          For Recruiters & Collaborators
        </h4>

        <div className="border-l-3 border-double pl-3">
          <p className="text-xs">
            I'm actively looking for web development roles (MERN + Next.js +
            PostgreSQL). Also open to research collaborations in bioinformatics
            and computational biology. Email me with "Opportunity" in the
            subject line for faster response.
          </p>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="flex gap-3 flex-wrap">
        <Button
          asChild
          variant="outline"
          className="border-3 border-double rounded-none"
        >
          <Link href="/posts">See posts</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-3 border-double rounded-none"
        >
          <Link href="/projects">See projects</Link>
        </Button>
      </div>
    </section>
  );
}
