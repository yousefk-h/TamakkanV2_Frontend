/** Reserve the frame independently of the video's intrinsic dimensions and
 * native controls, so loading metadata cannot resize its surrounding layout. */
export function VideoPlayer({ src, className = "" }: { src: string; className?: string }) {
  return (
    <div className={`relative aspect-video w-full min-w-0 overflow-hidden rounded-xl bg-[#0c1424] ${className}`}>
      <video src={src} controls playsInline className="absolute inset-0 h-full w-full object-contain" />
    </div>
  );
}
