(function(global, factory) {
  if (window.FORM_MODE === 'cardform') return;
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
      ? define(factory)
      : ((global = global || self), (global.ErrorNavigation = factory()));
})(this, function() { 'use strict';
  var state = {
    section: null,
    current: -1,
    errors: [],
    scrollToBottomOnClose: true,
  };

  function getMessage() {
    if (state.errors.length <= 0) {
      return JotForm.texts.doneMessage;
    }

    var msg="";
    if (state.errors.length === 1) {
      msg = JotForm.texts.oneError;
    }
    else{
      msg = JotForm.texts.multipleError;
    }

    msg = msg.replace('{count}', '<strong>' + state.errors.length + '</strong>');
    return msg;
  }

  function createNavigation(section) {
    var container = document.createElement('div');
    container.classList.add('error-navigation-container');
    container.style.display = 'none';
    container.setAttribute('aria-hidden', 'true');

    var inner = document.createElement('div');
    inner.classList.add('error-navigation-inner');
    container.appendChild(inner);

    var message = document.createElement('span');
    message.classList.add('error-navigation-message');
    message.setAttribute("role", "alert");
    message.setAttribute("aria-live", "polite");
    inner.appendChild(message);

    var nextButton = document.createElement('button');
    nextButton.classList.add('error-navigation-next-button');
    nextButton.type = 'button';
    nextButton.innerText = JotForm.texts.seeErrorsButton;
    nextButton.addEventListener('click', focusToNextError);
    inner.appendChild(nextButton);

    var doneButton = document.createElement('button');
    doneButton.classList.add('error-navigation-done-button');
    doneButton.type = 'button';
    doneButton.innerText = JotForm.texts.doneButton;
    doneButton.style.display = 'none';
    doneButton.addEventListener('click', close);
    inner.appendChild(doneButton);

    section.insertBefore(container, section.firstChild);
    return container;
  }

  function destroyNavigation(section) {
    var nav = section.querySelector('.error-navigation-container');
    if (nav) {
      nav.remove();
    }
  }

  function getAdvancedSignatureFocusTarget(line) {
    var wrapper = line.querySelector('.formAdvancedSignatureWrapper');
    if (!wrapper) {
      return null;
    }

    var typeInput = wrapper.querySelector('input[type="text"]:not([disabled])');
    if (typeInput) {
      return typeInput;
    }

    var drawCanvas = wrapper.querySelector('canvas.signatureCanvas');
    if (drawCanvas && drawCanvas.getAttribute('aria-hidden') !== 'true' && drawCanvas.tabIndex >= 0) {
      return drawCanvas;
    }

    return null;
  }

  function scrollAndFocus(nextCurrent, line, field, nextButton) {
    state.current = nextCurrent;
    line.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus();
    nextButton.disabled = false;
  }

  function isNewErrorCount() {
    const domErrorCount = state.section
      ? state.section.querySelectorAll('.form-line.form-line-error').length
      : document.querySelectorAll('.form-all .form-line.form-line-error').length;
    const stateErrorCount = state.errors.length;
    return domErrorCount !== stateErrorCount;
  }

  function focusToNextError() {
    var nextButton = document.querySelector('.error-navigation-next-button');
    nextButton.disabled = true;

    // reset current index if error count has changed
    if (isNewErrorCount()) state.current = -1;

    var nextCurrent = (state.current + 1) % state.errors.length;
    var erroredLine = state.errors[nextCurrent];
    if (!erroredLine) {
      return;
    }
    var erroredField = erroredLine.querySelector('.form-validation-error');
    if (!erroredField) {
      return;
    }

    if(erroredField.type === 'hidden' && erroredLine.dataset.type === 'control_captcha') {
      var iframe = erroredLine.querySelector('iframe');
      if (iframe) {
        // Update erroredField to point to iframe if it's hCaptcha
        erroredField = iframe;
      }
    }

    if(erroredField.type === 'hidden' && erroredLine.dataset.type === 'control_signature') {
      var advancedSignatureFocusTarget = getAdvancedSignatureFocusTarget(erroredLine);
      if (advancedSignatureFocusTarget) {
        erroredField = advancedSignatureFocusTarget;
      }
    }

    if(erroredLine.dataset.type === 'control_fileupload') {
      const hasFailedUpload = erroredField.querySelector('.qq-upload-fail');

      if(hasFailedUpload) {
        // Handle the case where there's a failed upload
        const deleteButton = hasFailedUpload.querySelector('.qq-upload-delete');
        if(deleteButton) {
          erroredField = deleteButton;
        }
      }
    }

    // The closed section collapse should be visible
    var parent = erroredLine.parentNode;
    var sectionCollapse = (parent && parent.hasClassName('form-section-closed')) ? parent.querySelector('li[data-type="control_collapse"] .form-collapse-table') : null;
    if (JotForm.doubleValidationFlag()) {
      var sections = document.querySelectorAll('ul.form-section:not([id^="section_"])');
      if (sections.length > 1) {
        var pagesIndex = parent.pagesIndex;
        if (pagesIndex === undefined && parent.parentNode) {
          pagesIndex = parent.parentNode.pagesIndex;
        }

        // Log when error navigation takes the user to a page they have not yet visited.
        // This is a potential cause for blank submissions or missing fields.
        if (Object.keys(JotForm.visitedPages || {}).length && pagesIndex && !JotForm.visitedPages[pagesIndex]) {
          if (!JotForm.errorNavigationMessages) JotForm.errorNavigationMessages = [];

          const allSections = Array.from(document.querySelectorAll('.page-section'));
          const currentPageIndex = allSections.indexOf(JotForm.currentSection) + 1;
          const errorMessageEl = erroredLine.querySelector('.form-error-message');
          const errorMessage = errorMessageEl ? errorMessageEl.innerText.trim() : '';

          if (JotForm.errorNavigationMessages.indexOf(errorMessage) === -1) {
            JotForm.errorCatcherLog({ message: {
              targetInput: erroredField.id || erroredField.className,
              targetInputPageIndex: pagesIndex,
              currentPageIndex: currentPageIndex,
              visitedPages: JotForm.visitedPages,
              message: errorMessage,
              stack: (new Error()).stack
            }}, 'ERROR_NAVIGATION_FOR_NON_VISITED_PAGE');

            JotForm.errorNavigationMessages.push(errorMessage);
          }
        }

        JotForm.jumpToPage(pagesIndex, true);
      }
    }
    if (sectionCollapse) {
      sectionCollapse.click();
      var collapseInterval = setInterval(function() {
        if (!parent.hasClassName('form-section-closed') || document.activeElement === erroredField) {
          clearInterval(collapseInterval);
        }
        scrollAndFocus(nextCurrent, erroredLine, erroredField, nextButton);
      }, 500);
    } else {
      scrollAndFocus(nextCurrent, erroredLine, erroredField, nextButton);
    }
  }

  function close() {
    if (state.scrollToBottomOnClose) {
      window.scrollTo({ left: 0, top: document.body.scrollHeight, behavior: 'smooth' });
    }

    var bottomInterval = setInterval(function() {
      if (!state.scrollToBottomOnClose || (window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
        clearInterval(bottomInterval);
        var errCont = state.section.querySelector('.error-navigation-container');
        if (errCont) {
            errCont.classList.add('fading-out');
        }
        setTimeout(function(){
          destroyNavigation(state.section);
        }, 210);
      }
    }, 100);
  }

  return {
    disableScrollToBottom: function disableScrollToBottom() {
      state.scrollToBottomOnClose = false;
    },
    update: function update(section, render) {
      if (!section) {
        var sections = document.querySelectorAll('.form-section.page-section');
        if (sections.length <= 0) {
          return;
        }
        section = sections[(sections.length - 1)];
      }
      if (JotForm.doubleValidationFlag()) {
        state.section = document.querySelector('.form-all');
      } else {
        state.section = section;
      }

      var invalidFields = state.section.querySelectorAll('.form-line.form-line-error');

      if (invalidFields.length <= 0 && state.errors.length <= 0) {
        destroyNavigation(state.section);
        return;
      }

      // reset current index if error count has changed
      if (isNewErrorCount()) state.current = -1;

      state.errors = invalidFields;

      var nav = state.section.querySelector('.error-navigation-container');
      if (!nav) {
        if (!render) {
          return;
        }
        nav = createNavigation(state.section);
      }

      if (state.errors.length > 0) {
        nav.querySelector('.error-navigation-next-button').style.display = 'block';
        nav.querySelector('.error-navigation-done-button').style.display = 'none';
        nav.classList.remove('is-success');
      } else {
        nav.classList.add('is-success');
        nav.querySelector('.error-navigation-next-button').style.display = 'none';
        nav.querySelector('.error-navigation-done-button').style.display = 'block';
      }

      nav.querySelector('.error-navigation-message').innerHTML = getMessage();

      // show navigation
      nav.style.display = null;
      nav.setAttribute('aria-hidden', 'false');
      nav.classList.remove('fading-out');
    },
  };
});
