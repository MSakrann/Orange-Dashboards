import type { DeptProfile } from "@/data/dept-structure";

export function DeptHero({ profile }: { profile: DeptProfile }) {
  return (
    <section className="dept-hero" aria-label="Department introduction">
      <div className="dept-hero-atmosphere" aria-hidden="true" />
      <div className="dept-hero-inner">
        <p className="dept-brand">{profile.brandName}</p>
        <h1 className="dept-hero-title">{profile.heroHeadline}</h1>
        <p className="dept-hero-support">{profile.heroSupport}</p>
      </div>
    </section>
  );
}
