
### IPEcho

Simple IP Echo Server

### Examples

```sh
curl 'http://ipecho.plexrayinc.com/?format=js&callback=foo'
```

```sh
curl -H 'Accept: application/javascript' \
    http://ipecho.plexrayinc.com/?callback=foo
```

```js
$.ajax({
    url: "http://ipecho.plexrayinc.com/",
    headers: {"Accept": "application/json"}
}).done(function(data) {
    console.log("Received:", data)
})
```

### Currently supported types:
* text/plain
* application/json
* text/yaml
* text/x-yaml
* application/yaml
* application/x-yaml
* text/html
