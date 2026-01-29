"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Scissors, Stethoscope, Truck, MessageSquare, Eye, Share2, Rocket, Shield, DollarSign, Zap, ArrowRight, ChevronDown } from "lucide-react";

const industries = [
  {
    key: "salon",
    title: "Hair Salon / Beauty",
    description: "Appointments, staff schedules, client profiles",
    icon: Scissors,
    color: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  },
  {
    key: "clinic",
    title: "Clinic / Diagnostic",
    description: "Patient booking, medical records, lab results",
    icon: Stethoscope,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    key: "courier",
    title: "Courier / Delivery",
    description: "Order tracking, driver management, routes",
    icon: Truck,
    color: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
];

const steps = [
  {
    number: 1,
    title: "Answer simple questions",
    description: "Tell us about your business in plain language",
    icon: MessageSquare,
  },
  {
    number: 2,
    title: "Instantly preview your app",
    description: "See your custom software before committing",
    icon: Eye,
  },
  {
    number: 3,
    title: "Share demo with your team",
    description: "Get feedback from partners and staff",
    icon: Share2,
  },
  {
    number: 4,
    title: "Go live when ready",
    description: "Pay only when you launch",
    icon: Rocket,
  },
];

const trustPoints = [
  {
    icon: Zap,
    title: "Zero-Thinking Mode",
    description: "The system blocks mistakes before you go live",
  },
  {
    icon: DollarSign,
    title: "Transparent Pricing",
    description: "Most customers pay $39/month",
  },
  {
    icon: Shield,
    title: "Your Data, Your Control",
    description: "Your data stays in your control",
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const router = useRouter();

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            <span className="font-semibold">Platform Factory</span>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => router.push("/dashboard")}
                data-testid="button-dashboard"
              >
                Dashboard
              </Button>
            ) : (
              <>
                <Link href="/login">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="button-login"
                  >
                    Sign in
                  </Button>
                </Link>
                <Link href="/dashboard/onboarding">
                  <Button
                    size="sm"
                    data-testid="button-header-cta"
                  >
                    Try free
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
              30 minutes to launch your business software
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl">
              No code. No mistakes. Preview free. Pay only when you go live.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/dashboard/onboarding" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full"
                  data-testid="button-try-free-preview"
                >
                  Try free preview
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                onClick={scrollToHowItWorks}
                className="w-full sm:w-auto"
                data-testid="button-see-how-it-works"
              >
                See how it works
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-12">
          <h2 className="mb-8 text-center text-2xl font-semibold">
            Choose your industry
          </h2>
          <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
            {industries.map((industry) => (
              <Link
                key={industry.key}
                href={`/dashboard/onboarding?industry=${industry.key}`}
                data-testid={`card-industry-${industry.key}`}
              >
                <Card className="h-full cursor-pointer transition-all hover-elevate">
                  <CardContent className="p-6 text-center">
                    <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${industry.color}`}>
                      <industry.icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold">{industry.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {industry.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="bg-muted/50 py-16">
          <div className="container mx-auto px-4">
            <h2 className="mb-12 text-center text-2xl font-semibold md:text-3xl">
              How it works
            </h2>
            <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <div key={step.number} className="text-center" data-testid={`step-${step.number}`}>
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <div className="mb-2 text-sm font-medium text-muted-foreground">
                    Step {step.number}
                  </div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
            {trustPoints.map((point, index) => (
              <div key={index} className="text-center" data-testid={`trust-${index}`}>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <point.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold">{point.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {point.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-primary py-16 text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">
              Ready to build your business software?
            </h2>
            <p className="mt-4 text-primary-foreground/80">
              Start your free preview in under 5 minutes
            </p>
            <Link href="/dashboard/onboarding" className="mt-8 inline-block">
              <Button
                size="lg"
                variant="secondary"
                data-testid="button-bottom-cta"
              >
                Try free preview
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Platform Factory. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
