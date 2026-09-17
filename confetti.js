// Confetti Particle System for Celebrations
const Confetti = (() => {
  let canvas = null;
  let ctx = null;
  let particles = [];
  let animationId = null;
  let isActive = false;

  const colors = [
    '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f43f5e', '#fbbf24', '#a855f7'
  ];

  function init() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function createParticle() {
    return {
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * 50,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: Math.random() * 4 + 3,
      speedX: Math.random() * 4 - 2,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 0.08 + 0.03
    };
  }

  function loop() {
    if (!isActive && particles.length === 0) {
      if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      cancelAnimationFrame(animationId);
      animationId = null;
      return;
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.y += p.speedY;
      p.x += Math.sin(p.wobble) * 2 + p.speedX;
      p.wobble += p.wobbleSpeed;
      p.rotation += p.rotSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();

      if (p.y > window.innerHeight + 20) {
        if (isActive) {
          particles[i] = createParticle();
        } else {
          particles.splice(i, 1);
        }
      }
    }

    animationId = requestAnimationFrame(loop);
  }

  return {
    start: (duration = 4500) => {
      init();
      isActive = true;
      particles = [];
      for (let i = 0; i < 150; i++) {
        const p = createParticle();
        p.y = Math.random() * (window.innerHeight * 0.7);
        particles.push(p);
      }
      if (!animationId) loop();

      setTimeout(() => {
        isActive = false;
      }, duration);
    },
    stop: () => {
      isActive = false;
      particles = [];
      if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (animationId) cancelAnimationFrame(animationId);
      animationId = null;
    }
  };
})();
