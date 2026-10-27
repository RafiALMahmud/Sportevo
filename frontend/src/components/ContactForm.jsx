import { useTranslation } from '../i18n/useTranslation'
import { useState } from 'react'
import api from '../api/client'
import { formError } from '../api/forms'
import { useAuth } from '../context/AuthContext'

const empty = { name: '', email: null, type: 'information', subject: '', message: '', website: '' }

export default function ContactForm() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)
  const [errors, setErrors] = useState({})
  const email = form.email ?? user?.email ?? ''
  const field = (key) => ({ id: `contact-${key}`, name: key, value: key === 'email' ? email : form[key], disabled: busy, onChange: event => setForm({ ...form, [key]: event.target.value }), 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `contact-${key}-error` : undefined })
  const feedback = (key) => errors[key] && <p id={`contact-${key}-error`} className="mt-1 text-sm text-rose-300">{t(errors[key][0])}</p>
  return <section id="contact" className="sport-contact mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div><p className="sport-section-label">{t("WE'RE HERE TO HELP")}</p><h2>{t("Reach out.")}<br />{t("We'll take it from here.")}</h2><p>{t("Have a question, a complaint or something we should know? Send a message to the SportEvo team.")}</p><a href="mailto:sportevobd@gmail.com">sportevobd@gmail.com</a></div>
    <form className="contact-form" onSubmit={async event => {
      event.preventDefault(); if (busy) return
      setBusy(true); setError(''); setSuccess(null); setErrors({})
      try { const { data } = await api.post('/contact', { ...form, email }); setSuccess({ message: data.message, reference: data.reference }); setForm(empty) }
      catch (err) { setError(formError(err)); setErrors(err.response?.data?.errors || {}) }
      finally { setBusy(false) }
    }}>
      <div aria-live="polite">{error && <p role="alert" className="mb-4 text-sm text-rose-300">{t(error)}</p>}{success && <p role="status" className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-300">{t('{message} Reference #{reference}.', { message: t(success.message), reference: success.reference })}</p>}</div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="contact-name">{t("Your name")}</label><input {...field('name')} required maxLength={120} autoComplete="name" />{feedback('name')}</div><div><label htmlFor="contact-email">{t("Your email")}</label><input {...field('email')} type="email" required maxLength={254} autoComplete="email" />{feedback('email')}</div></div>
      <label htmlFor="contact-type">{t("How can we help?")}</label><select {...field('type')}><option value="information">{t("Ask for information")}</option><option value="complaint">{t("Make a complaint")}</option><option value="other">{t("Something else")}</option></select>{feedback('type')}
      <label htmlFor="contact-subject">{t("Subject")}</label><input {...field('subject')} required maxLength={160} />{feedback('subject')}
      <label htmlFor="contact-message">{t("Your message")}</label><textarea {...field('message')} required minLength={10} maxLength={5000} rows={5} />{feedback('message')}
      <div hidden aria-hidden="true"><label htmlFor="contact-website">{t("Website")}</label><input {...field('website')} tabIndex={-1} autoComplete="off" /></div>
      <button type="submit" disabled={busy} className="sport-button sport-button-primary mt-5 w-full disabled:opacity-60">{busy ? t("Sending...") : t("Send message")}</button>
    </form>
  </section>
}
