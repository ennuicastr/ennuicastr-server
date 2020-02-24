(function() {
    var themeB = document.getElementById("theme-b");

    var dark = document.cookie.split(";").some(function(x) { return /^\s*ECTHEME=dark\s*$/.test(x); });
    var theme;
    setTheme();
    setButton();

    function setTheme() {
        theme = dark?"dark":"";
        document.documentElement.setAttribute("data-theme", theme);
    }

    function setButton() {
        if (themeB)
            themeB.innerHTML = '<i class="fa fa-' + (dark?"moon":"sun") + '-o"></i>';
    }

    if (themeB) {
        themeB.onclick = function(ev) {
            dark = !dark;
            setTheme();
            setButton();
            document.cookie = "ECTHEME=" + theme + ";path=/";

            ev.preventDefault();
            return false;
        };
    }
})();
