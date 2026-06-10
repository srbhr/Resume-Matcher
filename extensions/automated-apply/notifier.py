import os
import requests
from twilio.rest import Client
from dotenv import load_dotenv

load_dotenv()

account_sid = os.getenv("TWILIO_ACCOUNT_SID")
auth_token = os.getenv("TWILIO_AUTH_TOKEN")
twilio_number = os.getenv("TWILIO_WHATSAPP_NUMBER")
my_number = os.getenv("YOUR_WHATSAPP_NUMBER")

def upload_to_tmpfiles(file_path):
    """
    Uploads a file to tmpfiles.org and returns the direct download URL.
    """
    url = 'https://tmpfiles.org/api/v1/upload'
    print(f"Uploading {file_path} to tmpfiles.org for WhatsApp delivery...")
    try:
        with open(file_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(url, files=files)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'success':
                    # tmpfiles returns a URL like https://tmpfiles.org/12345/file.pdf
                    # We need the direct URL: https://tmpfiles.org/dl/12345/file.pdf
                    original_url = data['data']['url']
                    direct_url = original_url.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
                    return direct_url
    except Exception as e:
        print(f"Failed to upload to tmpfiles.org: {e}")
    return None

def send_whatsapp_notification(job_title, company, apply_link, pdf_path=None, docx_path=None, cover_letter="", project_suggestion=""):
    """
    Sends a WhatsApp message using Twilio API with the resume formats, cover letter, and project suggestions.
    """
    if not account_sid or account_sid == "your_twilio_account_sid_here":
        print("Twilio credentials not configured.")
        return

    client = Client(account_sid, auth_token)

    # 1. Upload files to get public URLs
    pdf_url = upload_to_tmpfiles(pdf_path) if pdf_path else None
    docx_url = upload_to_tmpfiles(docx_path) if docx_path else None

    # 2. Prepare the message body (keeping it under Twilio's 1600 char limit)
    message_body = (
        f"🎯 *New Job Match!*\n\n"
        f"*Position:* {job_title}\n"
        f"*Company:* {company}\n\n"
        f"🔗 *Apply Here:* {apply_link}\n\n"
        f"📄 *Your 100% ATS-friendly tailored resume is ready!*"
    )
    
    if pdf_url or docx_url:
        message_body += "\n\n⬇️ *Download Links:*"
        if pdf_url:
            message_body += f"\n• *PDF Resume:* {pdf_url}"
        if docx_url:
            message_body += f"\n• *DOCX Resume:* {docx_url}"
    else:
        message_body += f"\n\n(Saved locally in your Tailored_Resumes folder)"

    if project_suggestion:
        # Clip project suggestion preview to 400 characters to stay within Twilio limits
        preview_len = 400
        clipped_proj = project_suggestion[:preview_len].strip()
        if len(project_suggestion) > preview_len:
            clipped_proj += "..."
        message_body += f"\n\n💡 *Project Suggestion to Build*:\n{clipped_proj}"

    if cover_letter:
        # Clip cover letter preview to 500 characters to stay within Twilio limits
        preview_len = 500
        clipped = cover_letter[:preview_len].strip()
        if len(cover_letter) > preview_len:
            clipped += "..."
        message_body += f"\n\n✉️ *Cover Letter Preview*:\n{clipped}"

    # 3. Send via Twilio
    try:
        kwargs = {
            'from_': twilio_number,
            'body': message_body,
            'to': my_number
        }
        # Attach the PDF as media attachment if available, else DOCX, else None
        if pdf_url:
            kwargs['media_url'] = [pdf_url]
        elif docx_url:
            kwargs['media_url'] = [docx_url]
            
        message = client.messages.create(**kwargs)
        print(f"WhatsApp notification sent successfully! SID: {message.sid}")
        if pdf_url:
            print(f"PDF attachment: {pdf_url}")
        if docx_url:
            print(f"DOCX attachment: {docx_url}")
            
    except Exception as e:
        print(f"Failed to send WhatsApp message: {e}")

