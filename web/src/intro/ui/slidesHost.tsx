// RoleSlides modalining yagona nusxasi (IntroApp ildizida).
import { RoleSlides } from './slides'
import { chooseFromSlides, closeSlides, useSlidesRole } from './slidesStore'

export function RoleSlidesHost() {
  const role = useSlidesRole()
  return <RoleSlides role={role ?? 'himoyachi'} open={role !== null} onClose={closeSlides} onChooseRole={chooseFromSlides} />
}
