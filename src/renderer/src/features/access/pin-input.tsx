import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'

type PinInputProps = {
  id: string
  value: string
  onChange: (value: string) => void
  describedBy: string
  invalid: boolean
  disabled?: boolean
  autoFocus?: boolean
}

const FIRST_GROUP = [0, 1, 2, 3] as const
const SECOND_GROUP = [4, 5, 6, 7] as const

export function PinInput({
  id,
  value,
  onChange,
  describedBy,
  invalid,
  disabled = false,
  autoFocus = false,
}: PinInputProps): React.JSX.Element {
  return (
    <InputOTP
      id={id}
      value={value}
      onChange={onChange}
      maxLength={8}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="off"
      aria-invalid={invalid}
      aria-describedby={describedBy}
      disabled={disabled}
      autoFocus={autoFocus}
      containerClassName="pin-input"
    >
      <InputOTPGroup>
        {FIRST_GROUP.map((index) => (
          <InputOTPSlot key={index} index={index} mask />
        ))}
      </InputOTPGroup>
      <InputOTPSeparator aria-hidden="true" />
      <InputOTPGroup>
        {SECOND_GROUP.map((index) => (
          <InputOTPSlot key={index} index={index} mask />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
