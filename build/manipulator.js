document.addEventListener('DOMContentLoaded', () => {
  const figures = document.querySelectorAll('figure')
  const manipulators = document.querySelectorAll('.manipulator')
  for (let manipulator of manipulators) {
    const input = manipulator.querySelector('[type="range"]')
    const list = manipulator.querySelector('datalist')
    const indicator = manipulator.querySelector('span')
    input.removeAttribute('disabled')
    input.addEventListener('input', () => {
      const optiondata = list.querySelector(`[value="${input.value}"]`)
      indicator.innerText = optiondata.innerText
      for (let figure of figures) {
        const weight = input.value
        figure.style.fontWeight = weight
        figure.style.fontSize = `${optiondata.getAttribute('data-font-size')}px`
        const weights = figure.getAttribute('data-weights').split(' ')
        figure.toggleAttribute('hidden', !weights.includes(weight))
      }
    })
  }
  for (let figure of figures) {
    figure.style.cursor = 'pointer'
    figure.setAttribute('tabindex', 0)
    figure.addEventListener('click', () => {
      figure.focus()
      figure.select()
    })
  }
});