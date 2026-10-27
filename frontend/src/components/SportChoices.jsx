import { useTranslation } from '../i18n/useTranslation'
import { Input } from './ui'

export default function SportChoices({ sports, form, onChange }) {
  const { t } = useTranslation()
  const other = form.custom_sport !== undefined && form.custom_sport !== null
  return <div className="space-y-3"><fieldset className="flex flex-wrap gap-3"><legend className="mb-2 text-sm text-zinc-300">{t("Sports / facilities")}</legend>
    {sports.map((sport) => <label key={sport.id} className="text-sm text-zinc-300"><input type="checkbox" checked={form.sports.includes(sport.id)} onChange={() => onChange({ ...form, sports: form.sports.includes(sport.id) ? form.sports.filter((id) => id !== sport.id) : [...form.sports, sport.id] })} /> {t(sport.name)}</label>)}
    <label className="text-sm text-zinc-300"><input type="checkbox" checked={other} onChange={(e) => onChange({ ...form, custom_sport: e.target.checked ? '' : null })} />{t(" Other sport")}</label>
  </fieldset>{other && <Input label={t("Other game / sport name")} aria-label={t("Other sport name")} placeholder={t("For example: Pickleball")} required minLength={2} maxLength={80} value={form.custom_sport} onChange={(e) => onChange({ ...form, custom_sport: e.target.value })} />}</div>
}
