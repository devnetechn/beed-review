import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="space-y-4 text-sm text-neutral-700">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Terms and Conditions</h1>
        <p className="text-xs text-neutral-400">Last updated September 2026</p>
      </div>

      <p>
        WonnaLearn is a free study companion for BEEd, BSEd, and Civil Service Exam reviewers. By
        creating an account, you agree to the following.
      </p>

      <section className="space-y-1">
        <h2 className="font-semibold text-neutral-900">Your account</h2>
        <p>
          You&apos;re responsible for keeping your login credentials secure and for anything done
          under your account. You must be old enough to legally agree to these terms in your
          jurisdiction.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-neutral-900">Study content isn&apos;t guaranteed accurate</h2>
        <p>
          Quiz questions, AI tutor answers, and summaries are generated or curated to help you
          study, but they can contain mistakes. Don&apos;t treat anything here as a substitute for
          official curricula, your school&apos;s materials, or the actual licensure exam
          syllabus. Always verify against official sources before an exam.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-neutral-900">Linked resources</h2>
        <p>
          Search results may link to third-party open-license or public-domain materials hosted
          elsewhere. We don&apos;t control or vouch for the availability or accuracy of external
          sites.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-neutral-900">What we store</h2>
        <p>
          We store your account info, study activity (quiz attempts, saved resources, streaks),
          and anything you submit through search, the AI tutor, or feedback, so the app can work
          and so you can pick up where you left off.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-neutral-900">Changes</h2>
        <p>
          We may update these terms as the app changes. Continuing to use WonnaLearn after an
          update means you accept the revised terms.
        </p>
      </section>

      <p className="pt-2">
        <Link href="/signup" className="underline">
          Back to sign up
        </Link>
      </p>
    </div>
  );
}
