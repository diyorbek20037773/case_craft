import { PRODUCT } from '../config'
import { actions } from '../state'
import { LOGO_LARGE, TITLE_COPY } from './content'
import { IconChevronDown } from './icons'
import { DidYouKnow } from './loading/DidYouKnow'
import { StartStar } from './loading/StartStar'

/**
 * Konsept 1: katta emblema + wordmark, shior, bir qatorli izoh, katta oltin "Boshlash" (ortida 8 qirrali yulduz),
 * ostida "Bilasizmi?". Titulda zal bo‘sh — personajlar rejim tanlashda paydo bo‘ladi (scene/Characters.tsx).
 * Mobil (<640px): matn tepada, CTA pastdan 88px (yulduz uchi "Pastga aylantiring"ga tegmasin) — o‘rtada zal ochiq.
 * Yulduz faqat tugma atrofida: oraliqlar loading.css dagi .ld-star o‘lchamiga hisoblangan.
 * "Boshlash" 3D yuklanishini kutmaydi — doim ishlaydi.
 */
export function TitleScreen() {
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center px-5 pb-[5.5rem] pt-[calc(var(--stage-top)+1.5rem)] text-center sm:justify-center sm:pb-20 sm:pt-[calc(var(--stage-top)+1.75rem)]">
      <div className="title-scrim pointer-events-none absolute inset-0 max-sm:hidden" aria-hidden />
      <div className="ta-scrim-m pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative flex flex-col items-center">
        <h1 className="intro-rise m-0">
          <img
            src={LOGO_LARGE}
            alt={PRODUCT.name}
            width={900}
            height={747}
            fetchPriority="high"
            className="ta-logo drop-shadow-[0_18px_40px_rgba(0,0,0,0.6)]"
          />
        </h1>
        <p className="intro-rise intro-rise-d1 m-0 mt-3 font-display text-[2.1rem] font-semibold leading-[1.08] text-ivory drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)] sm:mt-5 sm:text-[3.4rem] lg:text-[4rem]">
          {PRODUCT.slogan}
        </p>
        <p className="intro-rise intro-rise-d2 m-0 mt-2 max-w-[36rem] text-[0.95rem] text-ivory/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.95)] sm:text-xl">
          {TITLE_COPY.description}
        </p>
      </div>

      <div className="relative flex w-full flex-col items-center max-sm:mt-auto">
        <div className="relative isolate mt-10 flex w-full justify-center">
          <StartStar />
          <button
            type="button"
            className="btn-primary btn-gold btn-gold-xl intro-rise intro-rise-d3 w-[min(100%,24rem)]"
            onClick={actions.start}
          >
            {TITLE_COPY.start}
          </button>
        </div>
        <DidYouKnow className="intro-rise intro-rise-d3 max-sm:order-first sm:mt-11" />
      </div>

      <a
        href="#loyiha"
        className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 flex-col items-center gap-0.5 whitespace-nowrap px-3 text-[0.9rem] text-ivory/80 transition-colors hover:text-gold-soft sm:bottom-4 sm:text-[0.95rem]"
      >
        {TITLE_COPY.scrollHint}
        <IconChevronDown className="intro-bob size-5" />
      </a>
    </div>
  )
}
