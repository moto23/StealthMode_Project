import React, { useRef } from 'react';
import emailjs from 'emailjs-com';
import '../css/Contact.css';

function Contact() {
  const form = useRef();

  const sendEmail = (e) => {
    e.preventDefault();

    emailjs.sendForm('service_9hyesnc', 'template_hl8iejn', form.current, 'YOUR_USER_ID')
      .then((result) => {
          console.log(result.text);
          alert('Message sent successfully!');
      }, (error) => {
          console.log(error.text);
          alert('Failed to send message. Please try again.');
      });
  };

  return (
    <div id='contact'>
      <div className="contact">
        <div className="contact-container">
          <h2>Contact Us</h2>
          <form ref={form} onSubmit={sendEmail}>
            <input type="text" name="user_name" placeholder="Name" required />
            <input type="email" name="user_email" placeholder="Email" required />
            <textarea name="message" placeholder="Message" required></textarea>
            <button type="submit" className="btn">Send</button>
          </form>
          {/* <div className="contact-options">
            <h3>Contact Options</h3>
            <p>Email: <a href="mailto:prasadnathe2018@gmail.com">prasadnathe2018@gmail.com</a></p>
            <p>Phone: <a href="tel:+917378552793">+91 7378552793</a></p>
            <p>Instagram: <a href="https://www.instagram.com/yourusername" target="_blank" rel="noopener noreferrer">yourusername</a></p>
            <p>LinkedIn: <a href="https://www.linkedin.com/in/yourusername" target="_blank" rel="noopener noreferrer">yourusername</a></p>
            <p>Telegram: <a href="https://t.me/yourusername" target="_blank" rel="noopener noreferrer">yourusername</a></p>
          </div> */}
        </div>
      </div>
    </div>
  );
}

export default Contact;
