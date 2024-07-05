import React, { useState, useEffect } from 'react';

function TypingEffect({ words }) {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [forward, setForward] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (forward) {
        if (subIndex < words[index].length) {
          setDisplayedText(displayedText + words[index][subIndex]);
          setSubIndex(subIndex + 1);
        } else {
          setForward(false);
        }
      } else {
        if (subIndex > 0) {
          setDisplayedText(displayedText.slice(0, -1));
          setSubIndex(subIndex - 1);
        } else {
          setForward(true);
          setIndex((index + 1) % words.length);
        }
      }
    }, forward ? 150 : 100);

    return () => clearTimeout(timeout);
  }, [displayedText, index, subIndex, forward, words]);

  return (
    <span>{displayedText}</span>
  );
}

export default TypingEffect;
