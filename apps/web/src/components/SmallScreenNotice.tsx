import CircuitMentorLogo from '@/components/ui/CircuitMentorLogo';

export default function SmallScreenNotice() {
  return (
    <div className="small-screen-notice">
      {/* Brand Logo */}
      <div className="notice-logo flex justify-center mb-4">
        <CircuitMentorLogo size={48} />
      </div>

      <h1 className="notice-title">Use a larger screen</h1>

      <p className="notice-body">
        CircuitMentor needs a tablet or laptop to place and wire components.
        Open this page on a device with a screen width of at least 768 pixels.
      </p>
    </div>
  );
}
