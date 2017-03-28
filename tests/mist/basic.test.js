const _ = require('underscore');
const Q = require('bluebird');
const fs = require('fs');
const path = require('path');
const should = require('chai').should();

const test = require('../_base').mocha(module, {
    app: 'mist',
});

test['Check for Mist title'] = function* () {
    (yield this.client.getTitle()).should.eql('Mist');
};

test['Sanity Check: main window is focused'] = function* () {
    const client = this.client;
    (yield client.getUrl()).should.match(/interface\/index\.html$/);
};

// FAILING ON TRAVIS
test['Browser bar should render urls with separators'] = function* () {
    const client = this.client;

    yield this.navigateTo('http://localhost:8080/page1/page2?param=value#hash');
    yield this.waitForText('.url-breadcrumb', 'http://localhost:8080 ▸ page1 ▸ page2 ▸ param=value ▸ hash');
};

test['Browser bar should not render script tags on breadcrumb view'] = function* () { // ETH-01-001
    const client = this.client;

    yield this.navigateTo('<script>alert()</script>');
    yield client.waitUntil(() => {
        return client.getText('.url-breadcrumb').then((e) => {
            return /404\.html$/.test(e);
        });
    }, 5000, 'expected breadcrumb to render as HTML encoded');

    should.exist(yield this.getUiElement('form.url'));
    should.not.exist(yield this.getUiElement('form.url script'));
};

test['Browser bar should not render script tags in disguise on breadcrumb view'] = function* () { // ETH-01-001
    const client = this.client;

    yield client.setValue('#url-input', '&lt;script&gt;alert()&lt;/script&gt;');
    const isUrlBlocked = (yield client.execute(() => { // Code executed in context of browser
        try { $('form.url').submit(); }
        catch(e) { return /Invalid URL/.test(e); }
        return false;
    })).value;

    isUrlBlocked.should.be.true;
    should.not.exist(yield this.getUiElement('form.url script'));
};

test['Browser bar should not render script tags in disguise (2) on breadcrumb view'] = function* () { // ETH-01-001
    const client = this.client;

    yield this.navigateTo('<svg><script>alert()</script></svg>');
    yield client.waitUntil(() => {
        return client.getText('.url-breadcrumb').then((e) => {
            return /404\.html$/.test(e);
        });
    }, 5000, 'expected breadcrumb to render as HTML encoded');

    should.exist(yield this.getUiElement('form.url'));
    should.not.exist(yield this.getUiElement('form.url svg'));
    should.not.exist(yield this.getUiElement('form.url script'));
};

test['Browser bar should not render arbitrary code as HTML'] = function* () { // ETH-01-001
    const client = this.client;

    yield client.waitUntil(() => {
        return client.getText('.url-breadcrumb', (e) => {
            return e === '%3Ciframe onload="alert%28%29%"%3E';
        });
    }, 5000, 'expected breadcrumb to render as HTML encoded');
};

test['Browser bar should not execute JS'] = function* () { // ETH-01-001
    const client = this.client;

    yield this.navigateTo('<script>window.pwned = true</script>');
    const mist = yield client.execute(() => { return window.mist }); // checking if `execute` works
    const pwned = yield client.execute(() => { return window.pwned });

    should.exist(mist.value);
    should.not.exist(pwned.value);
};

test['Should select Wallet and Browse tabs properly'] = function* () {
    const client = this.client;
    const walletTab = yield this.selectTab('wallet');
};

test['Load fixture page'] = function* () {
    const client = this.client;
    yield this.loadFixture();
};

test['"http://" protocol should be allowed on browser bar'] = function* () { // ETH-01-002
    const client = this.client;
    yield this.loadFixture();

    yield client.setValue('#url-input', `${this.fixtureBaseUrl}index.html`);
    const isProtocolBlocked = (yield client.execute(() => { // Code executed in context of browser
        try { $('form.url').submit(); }
        catch(e) { return /Invalid URL/.test(e); }
        return false;
    })).value;
    isProtocolBlocked.should.be.false;

    yield this.waitForText('.url-breadcrumb', 'http://localhost:8080 ▸ index.html');

    const browserBarText = yield this.client.getText('.url-breadcrumb');
    browserBarText.should.eql('http://localhost:8080 ▸ index.html'); // checks that did change displayed URL
};

test['"javascript:" protocol should be disallowed on browser bar'] = function* () { // ETH-01-002
    const client = this.client;
    yield this.loadFixture();
    yield client.setValue('#url-input', 'javascript:window.close()');

    const isProtocolBlocked = (yield client.execute(() => { // Code executed in context of browser
        try { $('form.url').submit(); }
        catch(e) { return /Invalid URL/.test(e); }
        return false;
    })).value;
    isProtocolBlocked.should.be.true;

    yield Q.delay(500);
    const browserBarText = yield this.getBrowserBarText();
    browserBarText.should.eql('http://localhost:8080'); // checks that hasn't changed displayed URL
};

test['"data:" protocol should be disallowed on browser bar'] = function* () { // ETH-01-002
    const client = this.client;
    yield this.loadFixture();
    yield client.setValue('#url-input', 'data:text/plain;charset=utf-8;base64,dGhpcyB0ZXN0IGlzIG9uIGZpcmU=');

    const isProtocolBlocked = (yield client.execute(() => { // Code executed in context of browser
        try { $('form.url').submit(); }
        catch(e) { return /Invalid URL/.test(e); }
        return false;
    })).value;
    isProtocolBlocked.should.be.true;

    yield Q.delay(500);
    const browserBarText = yield this.getBrowserBarText();
    browserBarText.should.eql('http://localhost:8080'); // checks that hasn't changed displayed URL
};

// test['"file:///" protocol should be disallowed'] = function* () { // ETH-01-002
//     const client = this.client;
//     const filePath = 'file://' + path.join(__dirname, '..', 'fixtures', 'index.html');

//     yield this.navigateTo(filePath);
//     yield Q.delay(1500);
//     const browserBarText = yield this.getBrowserBarText();
//     browserBarText.should.match(/errorPages ▸ 400.html$/);
// };

test['Pin tab test'] = function* () {
    const client = this.client;
    const sidebarItems = (yield client.elements('.sidebar nav > ul > li')).value;

    yield this.selectTab('browser');
    yield this.pinCurrentTab();

    const sidebarItemsAfterAdd = (yield client.elements('.sidebar nav > ul > li')).value;

    sidebarItems.length.should.eql(2);
    sidebarItemsAfterAdd.length.should.eql(3);
};

// test['Browse tab should be changed to pinned tab if the URL is the same'] = function* () { // ETH-01-007
//     const client = this.client;
//     yield this.selectTab('browser');

//     yield this.navigateTo('https://wallet.ethereum.org' );
//     yield Q.delay(1000);
//     const el = (yield client.element('.sidebar nav > ul > .selected'));
//     console.log('el', el);

//     el.getAttribute('data-tab-id').should.eql('wallet');

// };

// test['Wallet tab shouldn\'t have the page replaced if URLs does not match'] = function* () { // ETH-01-007
//     const client = this.client;
//     const app = this;
//     yield this.selectTab('wallet');

//     yield this.navigateTo(`${this.fixtureBaseUrl}index.html?https://wallet.ethereum.org`);
//     yield client.waitUntil(() => {
//         return client.element('.sidebar nav > ul > .selected').then((e) => {
//             console.log('e', e);
//             return e.getAttribute('data-tab-id') === 'browse';
//         });
//     }, 2000);
// };

// test['Wallet tab shouldn\'t have the page replaced if URLs does not match - 2'] = function* () { // ETH-01-007
//     const client = this.client;
//     const app = this;
//     yield this.selectTab('wallet');

//     // Now changing address via JS
//     yield client.setValue('#url-input', `${this.fixtureBaseUrl}index.html?https://wallet.ethereum.org`);
//     const isProtocolBlocked = yield client.execute(() => { // Code executed in context of browser
//         $('form.url').submit();
//     });

//     yield client.waitUntil(() => {
//         return client.element('.sidebar nav > ul > .selected').then((e) => {
//             console.log('e', e);
//             return e.getAttribute('data-tab-id') === 'browser';
//         });
//     }, 2000);
// };

test['Links with target _blank or _popup should open inside Mist'] = function* () {
    const client = this.client;
    yield this.navigateTo(`${this.fixtureBaseUrl}/fixture-popup.html`);
    yield this.getWindowByUrl(e => /popup.html$/.test(e));

    // TODO: click on the fixtures' links and assert if they opened on the same page
};

