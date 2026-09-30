import type { DeptProfile } from "@/data/dept-structure";

function OrangeLogo() {
  return (
    <div className="dept-hero-logo" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- static public brand asset */}
      <img className="dept-hero-logo-square" src="/orange-logo.png" alt="" width={160} height={160} />
    </div>
  );
}

export function DeptHero({ profile }: { profile: DeptProfile }) {
  return (
    <section className="dept-hero" aria-label="Department introduction">
      <div className="dept-hero-atmosphere" aria-hidden="true" />
      <div className="dept-hero-inner">
        <p className="dept-brand">{profile.brandName}</p>
        <h1 className="dept-hero-title">{profile.heroHeadline}</h1>
        <p className="dept-hero-support">{profile.heroSupport}</p>
      </div>
      <OrangeLogo />
    </section>
  );
}
