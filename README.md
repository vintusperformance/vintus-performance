# Vintus Performance Website

## Files in this project
- `index.html` — Homepage
- `services.html` — Training plans, nutrition plans, private coaching
- `about.html` — Anthony's story and background
- `contact.html` — Contact form
- `apply.html` — Private coaching application funnel (AI-powered)
- `css/style.css` — All styles
- `js/main.js` — Navigation, interactions, animations
- `images/` — Put your images here (see below)

## Images needed
Add these files to the `images/` folder:
- `hero-bg.jpg` — A high quality photo of you training (used as homepage hero background)
- `AboutVintus.png` — Your about page photo (already on old site)
- `favicon.png` — Your logo icon

## Before going live — two things to update

### 1. Add your Anthropic API key
In `apply.html`, find this line:
```
const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY';
```
Replace `YOUR_ANTHROPIC_API_KEY` with your real key from console.anthropic.com

### 2. Set up the contact form
The contact form uses Formspree (free). 
- Go to formspree.io, create a free account
- Create a new form, get your form ID
- In `contact.html`, find this line:
```
action="https://formspree.io/f/YOUR_FORM_ID"
```
Replace `YOUR_FORM_ID` with your real Formspree form ID.
All contact form submissions will be emailed to vintusperformance@gmail.com.

## Deploying to Vercel
1. Push all these files to your GitHub repo (vintusperformance/vintus-performance)
2. In Vercel, click "Import Project" → select the GitHub repo
3. Click Deploy — it goes live automatically
4. In Vercel Domains, connect vintusperformance.org to this project

## Next steps to add
- Stripe checkout for $997/month subscription
- Auto-confirmation email when someone books a consultation
- Training plan survey + AI generated plan flow
