import { useEffect } from 'react';

// Plays a video only while it is on screen, to save CPU and battery.
const observer =
    typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
              (entries) => {
                  entries.forEach((entry) => {
                      if (entry.isIntersecting) {
                          entry.target.play().catch(() => {});
                      } else {
                          entry.target.pause();
                      }
                  });
              },
              { threshold: 0.1 }
          )
        : null;

export function usePlayInView(ref) {
    useEffect(() => {
        const video = ref.current;
        if (!video || !observer) return undefined;
        observer.observe(video);
        return () => observer.unobserve(video);
    }, [ref]);
}
